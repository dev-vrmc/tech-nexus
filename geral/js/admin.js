// Arquivo: geral/js/admin.js

import { supabase } from './supabase.js';
import { authManager } from './auth.js';
import { productManager, formatPrice } from './products.js';
import { showToast, showLoader, hideLoader } from './ui.js';

// Mapa de categorias para converter ID -> slug e vice-versa
const categoryMapById = { 1: 'hardware', 2: 'perifericos', 3: 'computadores', 4: 'cadeiras', 5: 'monitores', 6: 'celulares' };
const categoryMapBySlug = { 'hardware': 1, 'perifericos': 2, 'computadores': 3, 'cadeiras': 4, 'monitores': 5, 'celulares': 6 };

let dashboardChartInstance = null;
let monthlyChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // =======================================================
    // LÓGICA DE PREVIEW DE IMAGEM
    // =======================================================
    const fileInput = document.getElementById('product-file-input');
    const selectBtn = document.getElementById('btn-select-image');
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('image-preview');
    const imageName = document.getElementById('image-name');

    if (selectBtn && fileInput) {
        // Ao clicar no botão "Importar", clica no input file escondido
        selectBtn.addEventListener('click', () => fileInput.click());

        // Quando o arquivo muda
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Cria URL local para preview
                const objectUrl = URL.createObjectURL(file);
                previewImg.src = objectUrl;
                imageName.textContent = `Arquivo: ${file.name}`;
                previewContainer.style.display = 'block';
            }
        });
    }
    showLoader();
    try {
        // Proteção da Rota
        await authManager.getCurrentUser();
        const profile = await authManager.fetchUserProfile();

        if (!profile || profile.role !== 'admin') {
            alert('Acesso negado. Você precisa ser um administrador.');
            window.location.href = 'index.html';
            return;
        }

        // Carrega todos os dados assincronamente
        await Promise.all([
            loadDashboardStats(),
            loadRevenueChart(),       // Gráfico 1: Diário (7 dias)
            loadMonthlyChart(),       // Gráfico 2: Semanal (Mensal)
            loadProducts(),
            loadOrders(),
            loadBanners(),
            loadReviews()
        ]);

        setupSidebarNavigation();
        setupBannerSystem();
        setupFormListeners();
        setupImageModal();

        try {
            const editParam = new URLSearchParams(window.location.search).get('edit');
            if (editParam) {
                // busca directo via productManager (mais confiável que depender do array carregado)
                const prod = await productManager.getProductById(editParam);
                if (prod) {
                    // ativa a aba Produtos
                    const productSection = document.getElementById('admin-products-section');
                    const productLink = document.querySelector('a[data-target="#admin-products-section"]');
                    const form = document.getElementById('adminAddProduct');
                    if (productSection && form) {
                        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
                        document.querySelectorAll('.admin-sidebar-link').forEach(l => l.classList.remove('active'));
                        productSection.classList.add('active');
                        if (productLink) productLink.classList.add('active');

                        // preenche o formulário (mesma lógica usada no loadProducts)
                        form.querySelector('input[name="id"]').value = prod.id || '';
                        form.querySelector('input[name="name"]').value = prod.name || '';
                        form.querySelector('input[name="price"]').value = prod.price || '';
                        form.querySelector('input[name="brand_meta"]').value = prod.brand_meta || '';
                        form.querySelector('textarea[name="description"]').value = prod.description || '';
                        form.querySelector('input[name="installments"]').value = prod.installments || '';
                        form.querySelector('input[name="stock"]').value = prod.stock || 0;

                        const featuredCheck = form.querySelector('input[name="featured"]');
                        if (featuredCheck) featuredCheck.checked = !!prod.featured;

                        const catSelect = form.querySelector('select[name="category"]');
                        if (catSelect && typeof categoryMapById !== 'undefined' && categoryMapById[prod.category_id]) {
                            catSelect.value = categoryMapById[prod.category_id];
                        }

                        const imgHidden = document.getElementById('product-image-url');
                        const previewContainer = document.getElementById('image-preview-container');
                        const previewImg = document.getElementById('image-preview');
                        const imgName = document.getElementById('image-name');
                        const fileInput = document.getElementById('product-file-input');

                        if (imgHidden) imgHidden.value = prod.img || '';
                        if (previewImg) previewImg.src = prod.img || '';
                        if (imgName) imgName.textContent = "Imagem atual (envie outra para alterar)";
                        if (previewContainer) previewContainer.style.display = 'block';
                        if (fileInput) fileInput.value = "";

                        const title = document.getElementById('product-form-title');
                        if (title) title.textContent = `✏️ Editando: ${prod.name}`;

                        // pequena animação / foco
                        setTimeout(() => {
                            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            const nameInput = form.querySelector('input[name="name"]');
                            if (nameInput) nameInput.focus();
                        }, 150);

                        // opcional: limpa o param da url pra não re-executar se recarregar
                        try { history.replaceState(null, '', 'admin.html'); } catch (err) { }
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao carregar produto via URL ?edit=', err);
        }

    } catch (authError) {
        showToast('Erro de autenticação.', 'error');
        console.error(authError);
    } finally {
        hideLoader();
    }
    // Função sugerida para carregar o avatar
    async function loadUserAvatar() {
        try {
            // 1. GARANTIR QUE TEMOS O USUÁRIO ATUAL
            // (Se você já tem o objeto 'profile' carregado fora daqui, pode pular esta etapa)
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // Se não estiver logado, para aqui.

            // 2. BUSCAR O CAMINHO DA FOTO NO BANCO
            const { data: profileData, error } = await supabase
                .from('profiles')
                .select('avatar_url')
                .eq('id', user.id) // Usa o ID do usuário autenticado
                .maybeSingle();

            if (error) throw error;
            if (!profileData || !profileData.avatar_url) {
                console.log("Usuário sem avatar definido.");
                return;
            }

            // 3. TRATAR A URL (O PULO DO GATO)
            let finalUrl = profileData.avatar_url;

            // Verifica se é um link completo (https) ou apenas um caminho interno
            if (!finalUrl.startsWith('http')) {
                // Se for apenas o caminho (ex: '1234/avatar.png'), gera o link público do Storage
                // ATENÇÃO: Substitua 'avatars' pelo nome exato do seu Bucket no Storage
                const { data: publicData } = supabase
                    .storage
                    .from('avatars')
                    .getPublicUrl(finalUrl);

                finalUrl = publicData.publicUrl;
            }

            // 4. ATUALIZAR O DOM
            const imgElement = document.getElementById('profile-photo');
            if (imgElement) {
                imgElement.src = finalUrl;
                // Opcional: Mostra a imagem caso ela esteja oculta
                imgElement.style.display = 'block';
            } else {
                console.warn("Elemento #profile-photo não encontrado no HTML.");
            }

        } catch (err) {
            console.error("Erro ao carregar avatar:", err);
        }
    }

    // Chame a função (pode colocar dentro do seu DOMContentLoaded)
    loadUserAvatar();
});

// Helper simples para atualizar texto
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// =======================================================
// 1. CARREGAR TODAS AS ESTATÍSTICAS
// =======================================================
async function loadDashboardStats() {
    try {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [
            { data: annualOrdersData, error: annualOrdersError },
            { count: clientCount, error: clientError },
            { count: productCount, error: productError }
        ] = await Promise.all([
            supabase.from('orders').select('total, created_at, status').gte('created_at', startOfYear.toISOString()).neq('status', 'canceled'),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
            supabase.from('products').select('id', { count: 'exact', head: true })
        ]);

        if (annualOrdersError || clientError || productError) throw new Error("Erro ao buscar dados");

        let annualRevenue = 0;
        let monthlyRevenue = 0;
        let weeklyRevenue = 0;
        let totalOrders = annualOrdersData.length;
        let monthlyOrders = 0;
        let dailyOrders = 0;

        annualOrdersData.forEach(order => {
            const price = Number(order.total);
            const date = new Date(order.created_at);

            annualRevenue += price;

            if (date >= startOfMonth) {
                monthlyRevenue += price;
                monthlyOrders++;
            }
            if (date >= sevenDaysAgo) {
                weeklyRevenue += price;
            }
            if (date >= startOfToday) {
                dailyOrders++;
            }
        });

        setText('stat-total-revenue', formatPrice(annualRevenue));
        setText('stat-total-orders', totalOrders);
        setText('stat-total-clients', clientCount);
        setText('stat-total-products', productCount);
        setText('stat-monthly-revenue', formatPrice(monthlyRevenue));
        setText('stat-weekly-revenue', formatPrice(weeklyRevenue));
        setText('stat-monthly-orders', monthlyOrders);
        setText('stat-daily-orders', dailyOrders);

    } catch (error) {
        console.error('Erro stats:', error);
        showToast('Erro ao carregar estatísticas.', 'error');
    }
}

// =======================================================
// GRÁFICOS (MANTIDOS ORIGINAIS)
// =======================================================
async function loadRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;
    try {
        const dates = [];
        const dateObjects = [];
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dateObjects.push(d);
            dates.push(d.toISOString().split('T')[0]);
        }

        const startDate = dates[0];
        const endDate = new Date().toISOString();

        const { data: orders, error } = await supabase
            .from('orders')
            .select('created_at, total, status')
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', endDate)
            .neq('status', 'canceled');

        if (error) throw error;

        const statsMap = dates.reduce((acc, date) => { acc[date] = { revenue: 0, count: 0 }; return acc; }, {});

        orders.forEach(order => {
            const dateKey = order.created_at.split('T')[0];
            if (statsMap[dateKey]) {
                statsMap[dateKey].revenue += Number(order.total);
                statsMap[dateKey].count += 1;
            }
        });

        const labels = dateObjects.map(d => {
            const dayOfWeek = dayNames[d.getDay()];
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${dayOfWeek} - ${day}/${month}`;
        });

        const revenueData = dates.map(d => statsMap[d].revenue);
        const orderCountData = dates.map(d => statsMap[d].count);

        const firstColor = '#7a00ff';
        const firstColorAlt = '#c29bff';
        const textColor = '#797979ff';
        const containerColor = '#2d2d44';
        const gridColor = 'gray';
        const subtleGridColor = 'grey';

        const chartContext = ctx.getContext('2d');
        const gradient = chartContext.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(122, 0, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(122, 0, 255, 0)');

        const data = {
            labels: labels,
            datasets: [
                {
                    label: ' Faturamento (R$)',
                    data: revenueData,
                    type: 'line',
                    borderColor: firstColor,
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: 'origin',
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: firstColor,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#fff',
                    yAxisID: 'y',
                },
                {
                    label: ' Qtd. Pedidos',
                    data: orderCountData,
                    type: 'line',
                    borderColor: firstColorAlt,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: firstColorAlt,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: firstColor,
                    fill: false,
                    yAxisID: 'y1'
                }
            ]
        };

        if (dashboardChartInstance) dashboardChartInstance.destroy();

        dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { padding: 20, labels: { color: textColor, font: { family: 'Orbitron' }, padding: 20 } },
                    tooltip: {
                        backgroundColor: containerColor,
                        titleColor: firstColorAlt,
                        bodyColor: textColor,
                        borderColor: firstColor,
                        borderWidth: 2,
                        cornerRadius: 8,
                        padding: 12,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.dataset.yAxisID === 'y') {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                                } else if (context.dataset.yAxisID === 'y1') {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: gridColor, lineWidth: 0.5 }, ticks: { color: textColor } },
                    y: { type: 'linear', display: true, position: 'left', grid: { color: gridColor }, ticks: { color: textColor } },
                    y1: { type: 'linear', display: true, position: 'right', grid: { color: subtleGridColor }, ticks: { color: textColor, stepSize: 1 } }
                }
            }
        });

    } catch (err) {
        console.error('Erro ao carregar gráfico semanal:', err);
    }
}

async function loadMonthlyChart() {
    const ctx = document.getElementById('monthlySalesChart');
    if (!ctx) return;

    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { data: orders, error } = await supabase
            .from('orders')
            .select('created_at, total')
            .gte('created_at', startOfMonth.toISOString())
            .lte('created_at', now.toISOString())
            .neq('status', 'canceled');

        if (error) throw error;

        const weekRanges = [];
        const monthlyStats = {};

        let currentDay = 1;
        let weekNumber = 1;
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        while (currentDay <= lastDayOfMonth && weekNumber <= 5) {
            const startDay = currentDay;
            const endDay = Math.min(startDay + 6, lastDayOfMonth);

            const startRange = new Date(now.getFullYear(), now.getMonth(), startDay);
            const endRange = new Date(now.getFullYear(), now.getMonth(), endDay);

            const startStr = `${String(startRange.getDate()).padStart(2, '0')}/${String(startRange.getMonth() + 1).padStart(2, '0')}`;
            const endStr = `${String(endRange.getDate()).padStart(2, '0')}/${String(endRange.getMonth() + 1).padStart(2, '0')}`;

            const label = `${startStr} a ${endStr}`;

            weekRanges.push({ startDay, endDay, label });
            monthlyStats[label] = { rev: 0, count: 0 };

            currentDay = endDay + 1;
            weekNumber++;
        }

        // Agrupamento
        orders.forEach(o => {
            const d = new Date(o.created_at);
            const day = d.getDate();
            const week = weekRanges.find(w => day >= w.startDay && day <= w.endDay);

            if (week) {
                monthlyStats[week.label].rev += o.total;
                monthlyStats[week.label].count += 1;
            }
        });

        const labels = weekRanges.map(w => w.label);
        const revenueData = labels.map(l => monthlyStats[l].rev);
        const orderCountData = labels.map(l => monthlyStats[l].count);

        // Cores iguais ao sistema visual
        const firstColor = '#7a00ff';
        const firstColorAlt = '#c29bff';
        const textColor = '#797979ff';
        const containerColor = '#2d2d44';
        const gridColor = 'gray';
        const subtleGridColor = 'grey';

        const chartContext = ctx.getContext('2d');
        const gradient = chartContext.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(122, 0, 255, 0.25)');
        gradient.addColorStop(1, 'rgba(122, 0, 255, 0)');

        if (monthlyChartInstance) monthlyChartInstance.destroy();

        monthlyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: ' Faturamento (R$)',
                        data: revenueData,
                        type: 'line',
                        borderColor: firstColor,
                        borderWidth: 3,
                        backgroundColor: gradient,
                        fill: 'origin',
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: firstColor,
                        pointHoverRadius: 8,
                        pointHoverBackgroundColor: '#fff',
                        yAxisID: 'y',
                    },
                    {
                        label: ' Qtd. Pedidos',
                        data: orderCountData,
                        type: 'line',
                        borderColor: firstColorAlt,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: firstColorAlt,
                        pointHoverRadius: 7,
                        pointHoverBackgroundColor: firstColor,
                        fill: false,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        padding: 20,
                        labels: { color: textColor, font: { family: 'Orbitron' }, padding: 20 }
                    },
                    tooltip: {
                        backgroundColor: containerColor,
                        titleColor: firstColorAlt,
                        bodyColor: textColor,
                        borderColor: firstColor,
                        borderWidth: 2,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: { family: 'Tektur', weight: 'bold', size: 14 },
                        bodyFont: { family: 'Orbitron', size: 12 },
                        caretSize: 8,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.dataset.yAxisID === 'y') {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.raw);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor, lineWidth: 0.5, drawBorder: false },
                        ticks: { color: textColor, font: { family: 'Orbitron', size: 10 } }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        grid: { color: gridColor, lineWidth: 0.5, drawBorder: false },
                        ticks: { color: textColor }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        grid: { color: subtleGridColor, lineWidth: 0.2 },
                        ticks: { color: textColor, stepSize: 1 }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Erro chart mensal:", err);
    }
}

// =======================================================
// SETUP E INTERFACE
// =======================================================

function setupSidebarNavigation() {
    const links = document.querySelectorAll('.admin-sidebar-link');
    const sections = document.querySelectorAll('.admin-section');
    links.forEach(link => {
        if (link.getAttribute('href') === 'index.html') return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            sections.forEach(s => s.classList.remove('active'));
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelector(targetId).classList.add('active');
        });
    });
}

function setupFormListeners() {
    const form = document.getElementById('adminAddProduct');
    const fileInput = document.getElementById('product-file-input');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();

        try {
            const formData = new FormData(form);
            // Pega os dados básicos
            const productData = Object.fromEntries(formData.entries());
            const id = productData.id;
            const file = fileInput.files[0];

            // ---------------------------------------------------
            // LÓGICA DE UPLOAD DE IMAGEM
            // ---------------------------------------------------
            let finalImageUrl = productData.img; // Começa com o valor do input hidden (útil para edição)

            if (file) {
                // 1. Limpa o nome do arquivo para evitar caracteres estranhos
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `${fileName}`;

                // 2. Upload para o bucket 'products'
                const { error: uploadError } = await supabase.storage
                    .from('products')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 3. Obter URL Pública
                const { data: publicUrlData } = supabase.storage
                    .from('products')
                    .getPublicUrl(filePath);

                finalImageUrl = publicUrlData.publicUrl;
            }

            // Se não tiver imagem nem nova nem antiga, impede salvar (opcional)
            if (!finalImageUrl) {
                throw new Error("A imagem do produto é obrigatória.");
            }

            // Atualiza o objeto para salvar no banco
            productData.img = finalImageUrl;
            // ---------------------------------------------------

            // Tratamento dos outros dados
            productData.category_id = categoryMapBySlug[productData.category];
            delete productData.category;
            productData.price = parseFloat(productData.price);
            productData.stock = parseInt(productData.stock, 10);
            productData.featured = formData.get('featured') === 'on';

            let error;
            if (id) {
                const { error: updErr } = await supabase.from('products').update(productData).eq('id', id);
                error = updErr;
            } else {
                delete productData.id;
                const { error: insErr } = await supabase.from('products').insert([productData]);
                error = insErr;
            }

            if (error) throw error;

            showToast('Produto salvo com sucesso!');

            // Resetar formulário
            form.reset();
            form.querySelector('input[name="id"]').value = '';
            document.getElementById('product-image-url').value = ''; // Limpa hidden
            document.getElementById('product-file-input').value = ''; // Limpa file input
            document.getElementById('image-preview-container').style.display = 'none'; // Esconde preview
            document.getElementById('image-name').textContent = '';
            document.getElementById('product-form-title').textContent = '➕ Adicionar Novo Produto';

            await loadProducts();

        } catch (err) {
            console.error(err);
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            hideLoader();
        }
    });
}

function setupImageModal() {
    const reviewsContainer = document.getElementById('adminReviewsContainer');
    const imageModal = document.getElementById('image-modal-overlay');
    const modalImg = document.getElementById('modal-image-content');
    const closeBtn = document.getElementById('image-modal-close');

    if (reviewsContainer && imageModal) {
        reviewsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('admin-review-image')) {
                modalImg.src = e.target.src;
                imageModal.classList.add('show');
            }
        });
        const close = () => imageModal.classList.remove('show');
        closeBtn.addEventListener('click', close);
        imageModal.addEventListener('click', (e) => { if (e.target === imageModal) close(); });
    }
}

function showAdminConfirmModal(message, onConfirmCallback) {
    const modal = document.getElementById('admin-confirm-modal');
    const msgEl = document.getElementById('admin-confirm-message');
    const yesBtn = document.getElementById('admin-confirm-yes');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (!modal) { if (confirm(message)) onConfirmCallback(); return; }

    msgEl.textContent = message;

    // Clones para remover listeners antigos
    const newYes = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    const close = () => modal.classList.remove('show');

    newYes.addEventListener('click', () => { onConfirmCallback(); close(); });
    newCancel.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

    modal.classList.add('show');
}

// =======================================================
// CARREGADORES DE DADOS (PRODUTOS & ORDERS)
// =======================================================

/**
 * Carrega a lista de produtos no painel de administração
 * e configura os listeners de edição e exclusão.
 */
async function loadProducts() {
    const container = document.getElementById('adminProducts');
    if (!container) return;

    // 1. Buscar produtos
    const products = await productManager.getProducts();

    // 2. Renderizar a lista na seção 'Visualizar Produtos'
    container.innerHTML = products.map(p => `
        <div class="admin-product-item">
            <span>
                <a href="item.html?id=${p.id}" target="_blank" class="admin-link">
                    ${p.name}
                </a> 
                (Estoque: ${p.stock})
            </span>
            <div>
                <button class="edit-btn" data-id="${p.id}">Editar</button>
                <button class="delete-btn" data-id="${p.id}">Excluir</button>
            </div>
        </div>
    `).join('');

    // 3. Configurar o Event Listener (Delegation)
    container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        // --- LÓGICA DE EDIÇÃO ---
        if (editBtn) {
            const id = editBtn.dataset.id;
            const prod = products.find(p => p.id == id);

            if (prod) {
                // Seleciona os elementos de navegação
                const productSection = document.getElementById('admin-products-section');
                const productLink = document.querySelector('a[data-target="#admin-products-section"]');
                const form = document.getElementById('adminAddProduct');

                if (!productSection || !form) {
                    console.error("Erro: Seção de produtos ou formulário não encontrado.");
                    return;
                }

                // A) FORÇAR A NAVEGAÇÃO VISUAL
                // ----------------------------------------------------
                // Remove a classe 'active' de TODAS as seções (esconde o Dashboard)
                document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
                // Remove a classe 'active' de TODOS os links da sidebar
                document.querySelectorAll('.admin-sidebar-link').forEach(l => l.classList.remove('active'));

                // Ativa a seção de produtos (mostra o formulário)
                productSection.classList.add('active');

                // Ativa o link na sidebar (feedback visual)
                if (productLink) {
                    productLink.classList.add('active');
                }
                // ----------------------------------------------------

                // B) POPULAR O FORMULÁRIO COM DADOS DO PRODUTO
                // ----------------------------------------------------
                form.querySelector('input[name="id"]').value = prod.id;
                form.querySelector('input[name="name"]').value = prod.name;
                form.querySelector('input[name="price"]').value = prod.price;
                form.querySelector('input[name="brand_meta"]').value = prod.brand_meta || '';
                form.querySelector('textarea[name="description"]').value = prod.description || '';
                form.querySelector('input[name="installments"]').value = prod.installments || '';
                form.querySelector('input[name="stock"]').value = prod.stock;

                // Checkbox
                const featuredCheck = form.querySelector('input[name="featured"]');
                if (featuredCheck) featuredCheck.checked = prod.featured;

                // Select Categoria (usando o mapa global)
                const catSelect = form.querySelector('select[name="category"]');
                if (catSelect && typeof categoryMapById !== 'undefined' && categoryMapById[prod.category_id]) {
                    catSelect.value = categoryMapById[prod.category_id];
                }

                // Imagem
                const imgHidden = document.getElementById('product-image-url');
                const previewContainer = document.getElementById('image-preview-container');
                const previewImg = document.getElementById('image-preview');
                const imgName = document.getElementById('image-name');
                const fileInput = document.getElementById('product-file-input');

                if (imgHidden) imgHidden.value = prod.img;
                if (previewImg) previewImg.src = prod.img;
                if (imgName) imgName.textContent = "Imagem atual (envie outra para alterar)";
                if (previewContainer) previewContainer.style.display = 'block';
                if (fileInput) fileInput.value = "";

                // Título e Foco
                const title = document.getElementById('product-form-title');
                if (title) title.textContent = `✏️ Editando: ${prod.name}`;

                // C) SCROLL PARA O FORMULÁRIO (com delay para renderizar a troca de aba)
                setTimeout(() => {
                    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const nameInput = form.querySelector('input[name="name"]');
                    if (nameInput) nameInput.focus();
                }, 150); // Aumentado ligeiramente para garantir a transição
                // ----------------------------------------------------
            }
        }

        // --- LÓGICA DE EXCLUIR ---
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            showAdminConfirmModal('Excluir produto?', async () => {
                showLoader();
                try {
                    await supabase.from('products').delete().eq('id', id);
                    await loadProducts();
                    showToast('Produto excluído!');
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao excluir.', 'error');
                } finally {
                    hideLoader();
                }
            });
        }
    });
}

// --- FUNÇÃO DE ORDERS COM SEU LAYOUT E FUNÇÕES FALTANTES ---

async function loadOrders() {
    showLoader();
    const container = document.getElementById('adminOrders');
    if (!container) return;

    try {
        // Seleciona pedidos e dados completos do perfil (endereço)
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
            `)
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

            // Bloco de Endereço Formatado
            const addressHtml = order.profiles ? `
                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin: 10px 0; border-left: 3px solid var(--first-color);">
                    <h4 style="margin-bottom: 5px; color: var(--first-color-alt);"><i class="ri-map-pin-line"></i> Endereço de Entrega:</h4>
                    <p style="font-size: 0.9rem; line-height: 1.4;">
                        ${order.profiles.address_street || 'Rua não informada'}, Nº ${order.profiles.address_number || 'S/N'}<br>
                        ${order.profiles.address_complement ? order.profiles.address_complement + '<br>' : ''}
                        ${order.profiles.address_neighborhood || 'Bairro -'} • ${order.profiles.address_city || 'Cidade'}/${order.profiles.address_state || 'UF'}<br>
                        <strong>CEP:</strong> ${order.profiles.address_zipcode || '---'}
                    </p>
                </div>
            ` : '<p style="color: orange;">Endereço não disponível no cadastro.</p>';

            return `
            <div class="admin-order">
                <div class="order-header">
                    <h2>Pedido #${order.id.toString().slice(0, 8)}...</h2>
                    <span class="order-date">${new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                
                <p><strong>Cliente:</strong> ${order.profiles?.full_name || 'Usuário Removido'}</p>
                
                ${addressHtml} 
                
                <div class="order-details">
                    <strong>Itens do Pedido:</strong>
                    <ul style="margin-top: 5px; padding-left: 20px;">
                    ${order.order_items.map(item => `
                        <li>
                            ${item.quantity}x <a href="item.html?id=${item.products?.id}" target="_blank" class="admin-link" style="color: var(--white-color); text-decoration: underline;">${item.products?.name || 'Produto Removido'}</a> 
                            — <span style="color: var(--first-color);">${Number(item.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </li>
                    `).join('')}
                    </ul>
                </div>

                <div class="order-footer" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                    <p style="font-size: 1.1rem;"><strong>Total:</strong> ${Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p class="order-status-text" style="margin: 10px 0;">Status: <strong>${statusMap[order.status]}</strong></p>
                </div>

                <div class="order-actions">
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

        // Listeners (Mantidos iguais)
        container.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                await updateOrderStatus(e.target.dataset.id, e.target.value);
                await loadOrders();
            });
        });

        container.querySelectorAll('.delete-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleDeleteOrder(e.target.dataset.id));
        });

    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        container.innerHTML = '<p>Erro ao carregar pedidos.</p>';
    } finally {
        hideLoader();
    }
}

// -----------------------------------------------------------
// NOVAS FUNÇÕES AUXILIARES (QUE FALTAVAM NO SEU CÓDIGO)
// -----------------------------------------------------------

async function updateOrderStatus(orderId, newStatus) {
    showLoader();
    try {
        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);

        if (error) throw error;
        showToast('Status atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        showToast('Erro ao atualizar status.', 'error');
    } finally {
        hideLoader();
    }
}

function handleDeleteOrder(orderId) {
    showAdminConfirmModal('Tem certeza que deseja excluir este pedido?', async () => {
        showLoader();
        try {
            // Se tiver cascata configurada no banco (ON DELETE CASCADE), deletar a order é suficiente.
            // Se não, pode ser necessário deletar os order_items antes. 
            // Vou assumir que o supabase resolve ou deletamos direto.
            const { error } = await supabase.from('orders').delete().eq('id', orderId);

            if (error) throw error;

            showToast('Pedido excluído com sucesso!');
            await loadOrders(); // Recarrega a lista
        } catch (error) {
            console.error('Erro ao excluir pedido:', error);
            showToast('Erro ao excluir pedido.', 'error');
        } finally {
            hideLoader();
        }
    });
}

// =======================================================
// AVALIAÇÕES (REVIEWS)
// =======================================================
async function loadReviews() {
    const container = document.getElementById('adminReviewsContainer');
    if (!container) return;

    // Busca reviews
    const { data: reviews } = await supabase.from('reviews')
        .select(`id, rating, comment, image_urls, created_at, approved, profiles(full_name, avatar_url), products(id, name)`)
        .order('approved', { ascending: true }) // Pendentes primeiro
        .order('created_at', { ascending: false });

    if (!reviews?.length) { container.innerHTML = '<p>Sem avaliações.</p>'; return; }

    container.innerHTML = reviews.map(r => {
        const statusLabel = r.approved
            ? '<span style="color:#00e676; font-weight:bold; font-size:0.8rem;">[APROVADO]</span>'
            : '<span style="color:#ff9100; font-weight:bold; font-size:0.8rem;">[PENDENTE]</span>';

        const approveBtn = !r.approved
            ? `<button class="approve-review-btn" data-id="${r.id}" style="padding: 5px 10px; font-size: 0.9rem; margin-right:5px;">Aprovar</button>`
            : '';

        // Cria o link para o produto
        const productLink = r.products ? `item.html?id=${r.products.id}` : '#';
        const productName = r.products ? r.products.name : 'Produto Desconhecido';

        return `
        <div class="admin-review-card" style="position: relative; ${r.approved ? '' : 'border: 1px solid #ff9100; box-shadow: 0 0 10px rgba(255, 145, 0, 0.1);'}">
            
            <div class="admin-review-header">
                <img src="${r.profiles?.avatar_url || 'geral/img/logo/simbolo.png'}" class="review-avatar">
                <div class="admin-review-info">
                    <span class="review-author-name">${r.profiles?.full_name || 'Anônimo'} ${statusLabel}</span>
                    
                    <a href="${productLink}" target="_blank" class="admin-product-link" style="color: var(--first-color); font-weight: bold; text-decoration: none; display: flex; align-items: center; gap: 5px; margin-top: 2px;">
                        ${productName} <i class="ri-external-link-line"></i>
                    </a>

                    <div class="stars" style="color: gold; margin-top: 2px;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                </div>
            </div>

            <p class="admin-review-comment" style="margin: 10px 0; color: #ddd;">${r.comment || 'Sem comentário por escrito.'}</p>
            
            <div class="admin-review-images">
                ${(r.image_urls || []).map(u => `<img src="${u}" class="admin-review-image" style="cursor: zoom-in;">`).join('')}
            </div>

            <div class="admin-review-footer" style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; opacity: 0.7;">${new Date(r.created_at).toLocaleDateString()}</span>
                <div style="display:flex;">
                    ${approveBtn}
                    <button class="delete-btn delete-review-btn" data-id="${r.id}" style="padding: 5px 10px; font-size: 0.9rem;">Excluir</button>
                </div>
            </div>
        </div>
    `}).join('');

    // Reaplicar Listeners (Aprovar e Excluir)
    container.querySelectorAll('.approve-review-btn').forEach(b => b.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        showLoader();
        try {
            const { error } = await supabase.from('reviews').update({ approved: true }).eq('id', id);
            if (error) throw error;
            showToast('Avaliação aprovada!', 'success');
            await loadReviews();
        } catch (err) {
            showToast('Erro ao aprovar.', 'error');
        } finally {
            hideLoader();
        }
    }));

    container.querySelectorAll('.delete-review-btn').forEach(b => b.addEventListener('click', (e) => {
        showAdminConfirmModal('Excluir avaliação?', async () => {
            showLoader();
            await supabase.from('reviews').delete().eq('id', e.target.dataset.id);
            await loadReviews();
            hideLoader();
        });
    }));
}

// =======================================================
// SISTEMA DE BANNERS
// =======================================================

function setupBannerSystem() {
    setupBannerImagePreview();
    setupProductSearchForBanner();
    setupBannerFormSubmit();
}

// 1. Preview da Imagem do Banner
function setupBannerImagePreview() {
    const fileInput = document.getElementById('banner-file-input');
    const btn = document.getElementById('btn-select-banner');
    const previewContainer = document.getElementById('banner-preview-container');
    const previewImg = document.getElementById('banner-preview');

    if (btn && fileInput) {
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                previewImg.src = URL.createObjectURL(file);
                previewContainer.style.display = 'block';
                btn.textContent = `Arquivo: ${file.name}`;
            }
        });
    }
}

// 2. Busca de Produto (Autocomplete)
function setupProductSearchForBanner() {
    const input = document.getElementById('banner-product-search');
    const resultsBox = document.getElementById('product-search-results');
    const hiddenId = document.getElementById('banner-product-id');
    const displaySelected = document.getElementById('selected-product-display');
    const nameSelected = document.getElementById('selected-product-name');

    if (!input) return;

    input.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            resultsBox.innerHTML = '';
            return;
        }

        const { data: products } = await supabase
            .from('products')
            .select('id, name, price')
            .ilike('name', `%${query}%`)
            .limit(5);

        if (products && products.length > 0) {
            resultsBox.innerHTML = products.map(p => `
                <div class="search-result-item" data-id="${p.id}" data-name="${p.name}" 
                     style="padding: 10px; background: #2d2d44; border-bottom: 1px solid #444; cursor: pointer;">
                    <strong>${p.name}</strong> - R$ ${p.price}
                </div>
            `).join('');
            resultsBox.style.display = 'block';
        } else {
            resultsBox.style.display = 'none';
        }
    });

    // Clique no resultado
    resultsBox.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (item) {
            hiddenId.value = item.dataset.id;
            nameSelected.textContent = item.dataset.name;
            displaySelected.style.display = 'block';
            resultsBox.style.display = 'none';
            input.value = ''; // Limpa a busca
        }
    });
}

// 3. Salvar Banner
function setupBannerFormSubmit() {
    const form = document.getElementById('adminAddBanner');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();

        try {
            const fileInput = document.getElementById('banner-file-input');
            const productId = document.getElementById('banner-product-id').value;
            const file = fileInput.files[0];

            if (!file) throw new Error("Selecione uma imagem.");
            if (!productId) throw new Error("Selecione um produto.");

            // Upload Imagem
            const fileName = `banner-${Date.now()}-${Math.random().toString(36).substring(2)}`;
            const { error: uploadError } = await supabase.storage
                .from('banners')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: publicUrl } = supabase.storage
                .from('banners')
                .getPublicUrl(fileName);

            // Salvar no Banco
            const { error: dbError } = await supabase.from('banners').insert([{
                image_url: publicUrl.publicUrl,
                product_id: productId
            }]);

            if (dbError) throw dbError;

            showToast('Banner adicionado com sucesso!');
            form.reset();
            document.getElementById('banner-preview-container').style.display = 'none';
            document.getElementById('selected-product-display').style.display = 'none';
            document.getElementById('btn-select-banner').innerHTML = '<i class="ri-upload-cloud-line"></i> Escolher Imagem';

            await loadBanners();

        } catch (err) {
            console.error(err);
            showToast(err.message, 'error');
        } finally {
            hideLoader();
        }
    });
}

// 4. Carregar Lista de Banners
async function loadBanners() {
    const container = document.getElementById('adminBannersList');
    if (!container) return;

    const { data: banners, error } = await supabase
        .from('banners')
        .select('id, image_url, created_at, products(name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    if (banners.length === 0) {
        container.innerHTML = '<p>Nenhum banner cadastrado.</p>';
        return;
    }

    container.innerHTML = banners.map(b => `
        <div class="admin-product-item" style="align-items: center;">
            <img src="${b.image_url}" style="width: 100px; height: 40px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1; margin-left: 15px;">
                <strong>Produto:</strong> ${b.products?.name || 'Produto Deletado'}
            </div>
            <button class="delete-btn delete-banner-btn" data-id="${b.id}" style="padding: 5px 10px;">
                <i class="ri-delete-bin-line"></i>
            </button>
        </div>
    `).join('');

    // Listener de Exclusão
    container.querySelectorAll('.delete-banner-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteBanner(e.target.closest('button').dataset.id));
    });
}

async function deleteBanner(id) {
    showAdminConfirmModal('Excluir este banner?', async () => {
        showLoader();
        try {
            await supabase.from('banners').delete().eq('id', id);
            await loadBanners();
            showToast('Banner removido.');
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir.', 'error');
        } finally {
            hideLoader();
        }
    });
}