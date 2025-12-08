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
            loadReviews()
        ]);

        setupSidebarNavigation();
        setupFormListeners();
        setupImageModal();

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
    if (!form) return;

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
                const { error: updErr } = await supabase.from('products').update(productData).eq('id', id);
                error = updErr;
            } else {
                delete productData.id;
                const { error: insErr } = await supabase.from('products').insert([productData]);
                error = insErr;
            }

            if (error) throw error;
            showToast('Produto salvo com sucesso!');
            form.reset();
            form.querySelector('input[name="id"]').value = '';
            document.getElementById('product-form-title').textContent = '➕ Adicionar Novo Produto';
            await loadProducts();
        } catch (err) {
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

async function loadProducts() {
    const container = document.getElementById('adminProducts');
    if (!container) return;
    const products = await productManager.getProducts();
    container.innerHTML = products.map(p => `
        <div class="admin-product-item">
            <span><a href="item.html?id=${p.id}" target="_blank" class="admin-link">${p.name}</a> (Estoque: ${p.stock})</span>
            <div>
                <button class="edit-btn" data-id="${p.id}">Editar</button>
                <button class="delete-btn" data-id="${p.id}">Excluir</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const prod = products.find(p => p.id == e.target.dataset.id);
        if (prod) {
            const form = document.getElementById('adminAddProduct');
            form.querySelector('input[name="id"]').value = prod.id;
            form.querySelector('input[name="name"]').value = prod.name;
            form.querySelector('input[name="img"]').value = prod.img;
            form.querySelector('input[name="price"]').value = prod.price;
            form.querySelector('input[name="brand_meta"]').value = prod.brand_meta || '';
            form.querySelector('textarea[name="description"]').value = prod.description || '';
            form.querySelector('input[name="installments"]').value = prod.installments || '';
            form.querySelector('input[name="stock"]').value = prod.stock;
            form.querySelector('input[name="featured"]').checked = prod.featured;
            form.querySelector('select[name="category"]').value = categoryMapById[prod.category_id];

            document.getElementById('product-form-title').textContent = `✏️ Editando: ${prod.name}`;
            form.scrollIntoView({ behavior: 'smooth' });
            document.querySelector('[data-target="#admin-products-section"]').click();
        }
    }));

    container.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => {
        showAdminConfirmModal('Excluir produto?', async () => {
            showLoader();
            await supabase.from('products').delete().eq('id', e.target.dataset.id);
            await loadProducts();
            hideLoader();
        });
    }));
}

// --- FUNÇÃO DE ORDERS COM SEU LAYOUT E FUNÇÕES FALTANTES ---

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

        // Adiciona Listeners para Mudança de Status
        container.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const orderId = e.target.dataset.id;
                const newStatus = e.target.value;
                await updateOrderStatus(orderId, newStatus);
                await loadOrders(); // Recarrega para atualizar visual
            });
        });

        // Adiciona Listeners para Exclusão
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

    const { data: reviews } = await supabase.from('reviews')
        .select(`id, rating, comment, image_urls, created_at, profiles(full_name, avatar_url), products(name)`)
        .order('created_at', { ascending: false });

    if (!reviews?.length) { container.innerHTML = '<p>Sem avaliações.</p>'; return; }

    container.innerHTML = reviews.map(r => `
        <div class="admin-review-card">
            <div class="admin-review-header">
                <img src="${r.profiles?.avatar_url || 'geral/img/logo/simbolo.png'}" class="review-avatar">
                <div class="admin-review-info">
                    <span class="review-author-name">${r.profiles?.full_name || 'Anônimo'}</span>
                    <span class="review-product-name">${r.products?.name}</span>
                    <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                </div>
            </div>
            <p class="admin-review-comment">${r.comment || ''}</p>
            <div class="admin-review-images">
                ${(r.image_urls || []).map(u => `<img src="${u}" class="admin-review-image">`).join('')}
            </div>
            <div class="admin-review-footer">
                <span>${new Date(r.created_at).toLocaleDateString()}</span>
                <button class="delete-btn delete-review-btn" data-id="${r.id}">Excluir</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.delete-review-btn').forEach(b => b.addEventListener('click', (e) => {
        showAdminConfirmModal('Excluir avaliação?', async () => {
            showLoader();
            await supabase.from('reviews').delete().eq('id', e.target.dataset.id);
            await loadReviews();
            hideLoader();
        });
    }));
}