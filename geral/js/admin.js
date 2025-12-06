// Arquivo: geral/js/admin.js

import { supabase } from './supabase.js';
import { authManager } from './auth.js';
import { productManager, formatPrice } from './products.js';
import { showToast, showLoader, hideLoader } from './ui.js';

// Mapa de categorias para converter ID -> slug e vice-versa
const categoryMapById = { 1: 'hardware', 2: 'perifericos', 3: 'computadores', 4: 'cadeiras', 5: 'monitores', 6: 'celulares' };
const categoryMapBySlug = { 'hardware': 1, 'perifericos': 2, 'computadores': 3, 'cadeiras': 4, 'monitores': 5, 'celulares': 6 };

let dashboardChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    try {
        // Proteção da Rota
        await authManager.getCurrentUser();
        // ESTE OBJETO JÁ TEM O ID DO USUÁRIO LOGADO!
        const profile = await authManager.fetchUserProfile(); 

        if (!profile || profile.role !== 'admin') {
            alert('Acesso negado. Você precisa ser um administrador.');
            window.location.href = 'index.html';
            return;
        }

        // Carrega todos os dados assincronamente
        await Promise.all([
            loadDashboardStats(),
            loadRevenueChart(),
            loadProducts(),
            loadOrders(),
            loadReviews()
        ]);
        
        // **1. Obter a URL da foto, usando o ID do perfil para filtrar**
        const { data: profilesData, error: photoError } = await supabase
            .from('profiles')
            .select('avatar_url')
            // FILTRO ADICIONADO: Garante que você pega apenas o seu registro
            .eq('id', profile.id) 
            .maybeSingle(); // Usa maybeSingle para evitar o erro 406 caso não exista perfil

        if (photoError) {
             console.error("Erro ao buscar avatar:", photoError);
             // Não para a execução, mas avisa sobre o problema da foto
        }

        const avatarUrl = profilesData?.avatar_url; 

        // **2. Encontrar o elemento <img> e atualizar o src**
        const imgElement = document.getElementById('profile-photo');

        if (imgElement && avatarUrl) {
            // Altera o atributo 'src' para o link do Supabase
            imgElement.src = avatarUrl;
        }


        // Lógica de navegação da barra lateral
        setupSidebarNavigation();

        const reviewsContainer = document.getElementById('adminReviewsContainer');
        if (reviewsContainer) {
            reviewsContainer.addEventListener('click', async (e) => {
                // Procura pelo botão de exclusão que foi clicado
                const deleteBtn = e.target.closest('.delete-btn');

                if (deleteBtn) {
                    const reviewId = deleteBtn.dataset.id;
                    if (reviewId) {
                        // Chama a função de exclusão (que já existe no admin.js)
                        handleDeleteReview(reviewId);
                    }
                }
            });
        }
        const form = document.getElementById('adminAddProduct');
        const formTitle = document.getElementById('product-form-title');
        const hiddenIdInput = form.querySelector('input[name="id"]');

        const urlParams = new URLSearchParams(window.location.search);
        const productIdToEdit = urlParams.get('edit');
        if (productIdToEdit) {
            const productToEdit = await productManager.getProductById(productIdToEdit);
            if (productToEdit) {
                handleEdit(productToEdit);
                // Mostra a seção de produtos se estiver editando
                document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
                document.getElementById('admin-products-section').classList.add('active');
                document.querySelectorAll('.admin-sidebar-link').forEach(l => l.classList.remove('active'));
                document.querySelector('[data-target="#admin-products-section"]').classList.add('active');
            }
        }

        // Lógica do Formulário
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader();
            try {
                const formData = new FormData(form);
                const productData = Object.fromEntries(formData.entries());
                const id = productData.id;

                productData.category_id = categoryMapBySlug[productData.category];
                delete productData.category;

                productData.price = parseFloat(productData.price);
                productData.stock = parseInt(productData.stock, 10);
                productData.featured = formData.get('featured') === 'on';

                let error;
                if (id) {
                    const { error: updateError } = await supabase.from('products').update(productData).eq('id', id);
                    error = updateError;
                } else {
                    delete productData.id;
                    const { error: insertError } = await supabase.from('products').insert([productData]);
                    error = insertError;
                }

                if (error) {
                    showToast(`Erro ao salvar produto: ${error.message}`, 'error');
                } else {
                    showToast('Produto salvo com sucesso!');
                    form.reset();
                    hiddenIdInput.value = '';
                    formTitle.textContent = '➕ Adicionar Novo Produto';
                    await loadProducts(); // Recarrega os produtos
                }
            } catch (err) {
                showToast(`Erro inesperado: ${err.message}`, 'error');
            } finally {
                hideLoader();
            }
        });

        // ===============================================
        // INÍCIO: LÓGICA DO MODAL DE VISUALIZAÇÃO DE IMAGEM
        // ===============================================
        // Estes elementos devem estar presentes no seu admin.html
        const imageModal = document.getElementById('image-modal-overlay');
        const modalImg = document.getElementById('modal-image-content');
        const imageModalCloseBtn = document.getElementById('image-modal-close');

        if (reviewsContainer && imageModal && modalImg && imageModalCloseBtn) {

            // Abre o modal ao clicar na imagem
            reviewsContainer.addEventListener('click', (e) => {
                // A classe 'admin-review-image' é definida em loadReviews()
                if (e.target.classList.contains('admin-review-image')) {
                    modalImg.src = e.target.src;

                    // MODIFICADO: Remove a lógica GSAP e usa apenas classList.add,
                    // idêntico ao funcionamento do item.js
                    imageModal.classList.add('show');
                }
            });

            // Função unificada para fechar o modal
            const closeImageModal = () => {
                // MODIFICADO: Remove a lógica GSAP e usa apenas classList.remove
                imageModal.classList.remove('show');
            };

            // Fecha o modal ao clicar no 'X'
            imageModalCloseBtn.addEventListener('click', closeImageModal);

            // Fecha o modal ao clicar no overlay
            imageModal.addEventListener('click', (e) => {
                if (e.target === imageModal) {
                    closeImageModal();
                }
            });
        }

    } catch (authError) {
        showToast('Erro de autenticação.', 'error');
        window.location.href = 'index.html';
    } finally {
        hideLoader();
    }
});

// =======================================================
// NAVEGAÇÃO DA BARRA LATERAL
// =======================================================
function setupSidebarNavigation() {
    const links = document.querySelectorAll('.admin-sidebar-link');
    const sections = document.querySelectorAll('.admin-section');

    links.forEach(link => {
        // Ignora o link "Voltar ao Site"
        if (link.getAttribute('href') === 'index.html') return;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            // Remove 'active' de todas as seções e links
            sections.forEach(s => s.classList.remove('active'));
            links.forEach(l => l.classList.remove('active'));

            // Adiciona 'active' ao link clicado e à seção alvo
            link.classList.add('active');
            document.querySelector(targetId).classList.add('active');
        });
    });
}

// =======================================================
// CARREGAR ESTATÍSTICAS DO DASHBOARD
// =======================================================
async function loadDashboardStats() {
    showLoader();
    try {
        const [
            { data: ordersData, error: ordersError },
            { count: clientCount, error: clientError },
            { count: productCount, error: productError }
        ] = await Promise.all([
            supabase.from('orders').select('total'),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
            supabase.from('products').select('id', { count: 'exact', head: true })
        ]);

        if (ordersError || clientError || productError) {
            throw new Error(ordersError?.message || clientError?.message || productError?.message);
        }

        // Calcula faturamento total
        const totalRevenue = ordersData.reduce((acc, order) => acc + order.total, 0);

        // Atualiza o HTML
        document.getElementById('stat-total-revenue').textContent = formatPrice(totalRevenue);
        document.getElementById('stat-total-orders').textContent = ordersData.length;
        document.getElementById('stat-total-clients').textContent = clientCount;
        document.getElementById('stat-total-products').textContent = productCount;

    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        showToast('Erro ao carregar estatísticas.', 'error');
    } finally {
        hideLoader();
    }
}

// =======================================================
// LÓGICA DO MODAL DE CONFIRMAÇÃO ADMIN
// =======================================================
/**
 * Exibe um modal de confirmação genérico para o painel admin.
 * @param {string} message A mensagem a ser exibida no modal.
 * @param {function} onConfirmCallback A função a ser executada se o admin confirmar.
 */
function showAdminConfirmModal(message, onConfirmCallback) {
    const modal = document.getElementById('admin-confirm-modal');
    const messageEl = document.getElementById('admin-confirm-message');
    const confirmBtn = document.getElementById('admin-confirm-yes');
    const cancelBtn = document.getElementById('confirm-cancel'); // ID do CSS
    const closeBtn = document.getElementById('admin-confirm-close'); // BOTÃO FECHAR (X)

    if (!modal || !messageEl || !confirmBtn || !cancelBtn || !closeBtn) {
        console.error('Elementos do modal de confirmação não encontrados.');
        // Fallback para o confirm nativo
        if (confirm(message)) {
            onConfirmCallback();
        }
        return;
    }

    messageEl.textContent = message;

    // Clona os botões para limpar listeners de cliques antigos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const newCloseBtn = closeBtn.cloneNode(true); // Clona o botão fechar
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);


    const hideModal = () => modal.classList.remove('show');

    // Adiciona listener ao novo botão de confirmar
    newConfirmBtn.addEventListener('click', () => {
        onConfirmCallback();
        hideModal();
    });

    // Adiciona listener ao novo botão de cancelar
    newCancelBtn.addEventListener('click', hideModal);

    // Adiciona listener ao novo botão de fechar (X)
    newCloseBtn.addEventListener('click', hideModal);

    // Adiciona listener para fechar clicando fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal();
        }
    }, { once: true }); // Executa apenas uma vez

    // Mostra o modal
    modal.classList.add('show');
}


// =======================================================
// LÓGICA DE PRODUTOS
// =======================================================
async function loadProducts() {
    showLoader();
    try {
        const container = document.getElementById('adminProducts');
        const products = await productManager.getProducts();

        if (!container) return;
        container.innerHTML = products.map(p => `
            <div class="admin-product-item">
                <span><a href="item.html?id=${p.id}" target="_blank" class="admin-link">${p.name}</a> (Estoque: ${p.stock})</span>
                
                <div>
                    <button class="edit-btn" data-id="${p.id}">Editar</button>
                    <button class="delete-btn" data-id="${p.id}">Excluir</button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const product = products.find(p => p.id == e.target.dataset.id);
                handleEdit(product);
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleDelete(e.target.dataset.id));
        });
    } catch (error) {
        showToast('Erro ao carregar produtos.', 'error');
    } finally {
        hideLoader();
    }
}

function handleEdit(product) {
    if (!product) return;
    const form = document.getElementById('adminAddProduct');
    form.querySelector('input[name="id"]').value = product.id;
    form.querySelector('input[name="name"]').value = product.name;
    form.querySelector('input[name="img"]').value = product.img;
    form.querySelector('input[name="price"]').value = product.price;
    form.querySelector('input[name="brand_meta"]').value = product.brand_meta || '';
    form.querySelector('textarea[name="description"]').value = product.description || '';
    form.querySelector('input[name="installments"]').value = product.installments || '';
    form.querySelector('input[name="stock"]').value = product.stock || 0;
    form.querySelector('input[name="featured"]').checked = !!product.featured;
    const categorySlug = categoryMapById[product.category_id];
    form.querySelector('select[name="category"]').value = categorySlug;
    document.getElementById('product-form-title').textContent = `✏️ Editando: ${product.name}`;
    form.scrollIntoView({ behavior: 'smooth' });
}

async function handleDelete(id) {
    // MODIFICADO: Usa o modal de confirmação
    showAdminConfirmModal('Tem certeza que deseja excluir este produto?', async () => {
        showLoader();
        try {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) {
                showToast(`Erro ao excluir: ${error.message}`, 'error');
            } else {
                showToast('Produto excluído com sucesso!');
                await loadProducts();
            }
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            hideLoader();
        }
    });
}

// =======================================================
// LÓGICA DE PEDIDOS
// =======================================================
async function loadOrders() {
    showLoader();
    const container = document.getElementById('adminOrders');
    if (!container) return;

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id, created_at, total, status,
                profiles!inner(
                    full_name,
                    address_street,
                    address_number,
                    address_complement,
                    address_neighborhood,
                    address_city,
                    address_state,
                    address_zipcode
                ),
                order_items ( quantity, unit_price, products!inner(id, name) )
            `) // <-- MODIFICADO: Buscando 'id' e 'name' de products
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!orders || orders.length === 0) {
            container.innerHTML = '<p>Nenhum pedido encontrado.</p>';
            return;
        }

        container.innerHTML = orders.map(order => {
            const statusMap = {
                pending: 'Pedido pendente.',
                shipped: 'Pedido enviado.',
                completed: 'Pedido concluído.',
                canceled: 'Pedido cancelado.'
            };

            const addressHtml = order.profiles ? `
                <div class="order-address">
                    <strong>Endereço de Entrega:</strong>
                    <p>
                        ${order.profiles.address_street || 'Rua não informada'}, Nº ${order.profiles.address_number || 'S/N'}<br>
                        ${order.profiles.address_complement ? order.profiles.address_complement + '<br>' : ''}
                        ${order.profiles.address_neighborhood || 'Bairro não informado'} - ${order.profiles.address_city || 'Cidade não informada'}/${order.profiles.address_state || 'UF'}<br>
                        CEP: ${order.profiles.address_zipcode || 'CEP não informado'}
                    </p>
                </div>
                <br>
            ` : '<p>Endereço não disponível.</p>';

            return `
            <div class="admin-order">
                <div class="order-header">
                    <h2>Pedido Nº: ${order.id}</h2><br>
                    <p><strong>Nome:</strong> ${order.profiles?.full_name || 'Usuário Removido'}</p><br>
                </div>
                ${addressHtml} 
                <div class="order-details">
                    <strong>Itens do Pedido:</strong><br>
                    <ul>
                    ${order.order_items.map(item => `
                        <li>
                            -- ${item.quantity}x <a href="item.html?id=${item.products?.id}" target="_blank" class="admin-link">${item.products?.name || 'Produto Removido'}</a> — 
                            ${Number(item.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </li>
                    `).join('')}
                    </ul>
                </div>
                <div class="order-footer">
                    <p><strong>Total:</strong> ${Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><br>
                    <p><strong>Data:</strong> ${new Date(order.created_at).toLocaleDateString('pt-BR')}</p><br>
                </div>
                <p class="order-status-text">${statusMap[order.status]}</p>
                <div class="order-actions">
                    <label for="status-${order.id}" style="margin-top:5px"><strong>Alterar Status:</strong></label>
                    <select class="order-status-select" data-id="${order.id}">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pendente</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Enviado</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Concluído</option>
                        <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Cancelado</option>
                    </select>
                    <button class="delete-order-btn" data-id="${order.id}">Excluir Pedido</button>
                </div>
            </div>
        `}).join('');

        container.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const orderId = e.target.dataset.id;
                const newStatus = e.target.value;
                await updateOrderStatus(orderId, newStatus);
                await loadOrders();
            });
        });

        container.querySelectorAll('.delete-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleDeleteOrder(e.target.dataset.id);
            });
        });
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        container.innerHTML = '<p>Erro ao carregar pedidos.</p>';
    } finally {
        hideLoader();
    }
}

async function updateOrderStatus(orderId, status) {
    showLoader();
    try {
        const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
        if (error) {
            showToast(`Erro ao atualizar status: ${error.message}`, 'error');
        } else {
            showToast(`Status do pedido #${orderId} atualizado.`);
        }
    } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
    } finally {
        hideLoader();
    }
}

async function handleDeleteOrder(orderId) {
    // MODIFICADO: Usa o modal de confirmação
    showAdminConfirmModal(`Tem certeza que deseja excluir o pedido #${orderId}? Esta ação não pode ser desfeita.`, async () => {
        showLoader();
        try {
            const { error } = await supabase.from('orders').delete().eq('id', orderId);
            if (error) {
                showToast(`Erro ao excluir pedido: ${error.message}`, 'error');
            } else {
                showToast('Pedido excluído com sucesso!');
                await loadOrders(); // Recarrega a lista de pedidos
            }
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            hideLoader();
        }
    });
}

// =======================================================
// LÓGICA DE AVALIAÇÕES (REVIEWS)
// =======================================================
async function loadReviews() {
    showLoader();
    const container = document.getElementById('adminReviewsContainer');
    if (!container) return;

    try {
        // Busca avaliações, juntando dados do perfil (autor) e do produto
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select(`
                id,
                created_at,
                comment,
                rating,
                image_urls,
                profile:profiles(full_name, avatar_url),
                product:products(id, name)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p>Nenhuma avaliação encontrada.</p>';
            return;
        }

        container.innerHTML = reviews.map(review => {
            const avatarSrc = review.profile?.avatar_url || 'geral/img/logo/simbolo.png';
            const authorName = review.profile?.full_name || 'Usuário Anônimo';

            const productName = review.product?.name || 'Produto Removido';
            const productId = review.product?.id;

            const productHTML = productId
                ? `<a href="item.html?id=${productId}#reviews-list" target="_blank" class="admin-link">${productName}</a>`
                : productName;

            // Gera HTML para as imagens (se houver)
            // A classe 'admin-review-image' será o gatilho para o modal
            const imagesHTML = (review.image_urls || []).map(url =>
                `<img src="${url}" alt="Imagem da avaliação" class="admin-review-image">`
            ).join('');

            return `
            <div class="admin-review-card">
                <header class="admin-review-header">
                    <img src="${avatarSrc}" alt="Avatar de ${authorName}" class="review-avatar">
                    <div class="admin-review-info">
                        <span class="review-author-name">${authorName}</span>
                        <span class="review-product-name">Produto: <strong>${productHTML}</strong></span>
                        <div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                    </div>
                </header>
                <p class="admin-review-comment">${review.comment || '<i>(Sem comentário)</i>'}</p>
                ${imagesHTML ? `<div class="admin-review-images">${imagesHTML}</div>` : ''}
                    <footer class="admin-review-footer">
                    <span>${new Date(review.created_at).toLocaleString('pt-BR')}</span>
                    <button class="delete-btn delete-my-review-btn" data-id="${review.id}">
                        <i class="ri-delete-bin-line"></i> Excluir
                    </button>
                </footer>
            </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Erro ao buscar avaliações:', error);
        container.innerHTML = '<p>Erro ao carregar avaliações.</p>';
        showToast('Erro ao carregar avaliações.', 'error');
    } finally {
        hideLoader();
    }
}

async function handleDeleteReview(id) {
    // MODIFICADO: Usa o modal de confirmação
    showAdminConfirmModal('Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.', async () => {
        showLoader();
        try {
            // Deleta a avaliação da tabela 'reviews'
            const { error } = await supabase.from('reviews').delete().eq('id', id);

            if (error) {
                showToast(`Erro ao excluir avaliação: ${error.message}`, 'error');
            } else {
                showToast('Avaliação excluída com sucesso!');
                await loadReviews(); // Recarrega a lista de avaliações
            }
        } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            hideLoader();
        }
    });
}

// =======================================================
// GRÁFICO SINISTRO: PERFORMANCE SEMANAL (REESCRITO E MELHORADO)
// =======================================================
async function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    try {
        // 1. Calcular datas e buscar dados
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const startDate = dates[0];
        const endDate = new Date().toISOString();

        const { data: orders, error } = await supabase
            .from('orders')
            .select('created_at, total')
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', endDate)
            .neq('status', 'canceled');

        if (error) throw error;

        // 2. Processar dados (Agrupar por dia)
        // RESTAURADO: Inicializa mapa com zeros, incluindo 'count' (pedidos)
        const statsMap = dates.reduce((acc, date) => {
            acc[date] = { revenue: 0, count: 0 };
            return acc;
        }, {});

        orders.forEach(order => {
            const dateKey = order.created_at.split('T')[0];
            if (statsMap[dateKey]) {
                statsMap[dateKey].revenue += Number(order.total);
                statsMap[dateKey].count += 1; // RESTAURADO: Contagem de pedidos
            }
        });

        const labels = dates.map(date => {
            const [y, m, d] = date.split('-');
            return `${d}/${m}`;
        });
        const revenueData = dates.map(d => statsMap[d].revenue);
        const orderCountData = dates.map(d => statsMap[d].count); // RESTAURADO: Dados de pedidos

        // 3. Obter cores dinamicamente
        const firstColor = '#7a00ff';
        const firstColorAlt = '#c29bff';
        const textColor = '#797979ff';
        const containerColor = '#2d2d44';

        // Cor das Linhas Réguas (Grid)
        const gridColor = 'gray';
        const subtleGridColor = 'grey'; // Cor para o grid secundário

        // 4. Configurar Dados e Estilos
        const chartContext = ctx.getContext('2d');
        const gradient = chartContext.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(122, 0, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(122, 0, 255, 0)');

        const data = {
            labels: labels,
            datasets: [
                // Receita (Faturamento) - Linha principal
                {
                    label: ' Faturamento (R$)',
                    data: revenueData,
                    type: 'line',
                    borderColor: firstColor,
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: 'origin',
                    tension: 0.4, // Curva suave
                    pointRadius: 5,
                    pointBackgroundColor: firstColor,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#fff',
                    yAxisID: 'y',
                },
                // RESTAURADO: Qtd. Pedidos - Linha tracejada secundária
                {
                    label: ' Qtd. Pedidos',
                    data: orderCountData,
                    type: 'line',
                    borderColor: firstColorAlt,
                    borderWidth: 2,
                    borderDash: [5, 5], // Tracejado
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: firstColorAlt,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: firstColor,
                    fill: false,
                    yAxisID: 'y1' // Eixo Y secundário
                }
            ]
        };

        if (dashboardChartInstance) {
            dashboardChartInstance.destroy();
        }

        dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        padding: 20, // espaço geral da legenda
                        labels: {
                            color: textColor,
                            font: { family: 'Orbitron' },
                            padding: 20 // espaço entre os quadradinhos
                        }
                    },
                    tooltip: {
                        // MELHORIA DA MENSAGENZINHA (TOOLTIP)
                        backgroundColor: containerColor,
                        titleColor: firstColorAlt,
                        bodyColor: textColor,
                        borderColor: firstColor,
                        borderWidth: 2,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: {
                            family: 'Tektur',
                            weight: 'bold',
                            size: 14
                        },
                        bodyFont: {
                            family: 'Orbitron',
                            size: 12
                        },
                        caretSize: 8,

                        callbacks: {
                            title: function (context) {
                                // Mostra a data como título
                                return context[0].label;
                            },
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.dataset.yAxisID === 'y') {
                                    // Faturamento (Eixo Esquerdo)
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                                } else if (context.dataset.yAxisID === 'y1') {
                                    // Qtd. Pedidos (Eixo Direito)
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: gridColor,
                            lineWidth: 0.5,
                            drawBorder: false,
                        },
                        ticks: { color: textColor, font: { family: 'Orbitron', size: 10 } }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            color: gridColor,
                            lineWidth: 0.5,
                            drawBorder: false,
                        },
                        ticks: { color: textColor, font: { family: 'Orbitron' } }
                    },
                    // RESTAURADO: Eixo y1 para quantidade de pedidos
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: true,
                            color: subtleGridColor, // Réguas secundárias mais suaves
                            lineWidth: 0.2,
                        },
                        ticks: { color: textColor, stepSize: 1 }
                    }
                }
            }
        });

    } catch (err) {
        console.error('Erro ao carregar gráfico:', err);
        showToast('Erro ao carregar gráfico de desempenho.', 'error');
    }
}