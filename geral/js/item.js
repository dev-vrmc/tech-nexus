// Arquivo: geral/js/item.js

import { supabase } from './supabase.js';
import { productManager } from './products.js';
import { cart } from './cart.js';
import { renderProducts, showToast, showLoader, hideLoader } from './ui.js';
import { authManager } from './auth.js';
import { wishlistManager } from './wishlist.js';

// ===============================================
// FUNÇÃO DE MODAL DE CONFIRMAÇÃO (Sim/Não)
// Mantida, pois é usada para DELETAR a review
// ===============================================
/**
 * Exibe um modal de confirmação genérico para a página de item.
 * @param {string} message A mensagem a ser exibida.
 * @param {function} onConfirmCallback A função a ser executada se o usuário confirmar.
 */
function showItemConfirmModal(message, onConfirmCallback) {
    const modal = document.getElementById('item-confirm-modal');
    const messageEl = document.getElementById('item-confirm-message');
    const confirmBtn = document.getElementById('item-confirm-yes');
    const cancelBtn = document.getElementById('item-confirm-cancel');

    if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
        console.error('Elementos do modal de confirmação não encontrados. Usando confirm() nativo.');
        if (confirm(message)) { onConfirmCallback(); }
        return;
    }
    
    // Atualiza o texto do botão para ser mais claro
    const deleteText = message.includes('excluir') ? 'Sim, Excluir' : 'Confirmar';
    confirmBtn.textContent = deleteText;

    messageEl.textContent = message;

    // Clona os botões para limpar listeners de cliques antigos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const hideModal = () => modal.classList.remove('show');

    newConfirmBtn.addEventListener('click', () => {
        onConfirmCallback();
        hideModal();
    }, { once: true }); // 'once: true' remove o listener após o clique

    newCancelBtn.addEventListener('click', hideModal, { once: true });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal();
        }
    }, { once: true });

    modal.classList.add('show');
}
// ===============================================
// FIM FUNÇÃO MODAL DE CONFIRMAÇÃO
// ===============================================


// Função para renderizar as estrelas e a nota
function renderRating(product) {
    const container = document.getElementById('product-rating-container');
    if (!container) return;

    if (!product.review_count || product.review_count === 0) {
        container.innerHTML = `<p class="no-reviews">Este produto ainda não foi avaliado.</p>`;
        return;
    }

    const rating = product.average_rating || 0;
    const count = product.review_count;

    let starsHTML = '';
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.4 ? 1 : 0; 
    const emptyStars = 5 - fullStars - halfStar;

    for (let i = 0; i < fullStars; i++) {
        starsHTML += '<i class="ri-star-fill"></i>';
    }
    if (halfStar) {
        starsHTML += '<i class="ri-star-half-fill"></i>';
    }
    for (let i = 0; i < emptyStars; i++) {
        starsHTML += '<i class="ri-star-line"></i>';
    }

    const ratingText = parseFloat(rating).toFixed(1).replace('.', ',');
    const reviewText = count === 1 ? 'avaliação' : 'avaliações';

    container.innerHTML = `
        <div class="stars">${starsHTML}</div>
        <span class="rating-value">${ratingText}</span>
        <span class="review-count">(${count} ${reviewText})</span>
    `;
}

// Função para buscar e renderizar avaliações
async function fetchAndRenderReviews(productId, loggedInUserId, isAdmin = false) {
    const reviewsList = document.getElementById('reviews-list');
    if (!reviewsList) return;

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('*, profile:profiles(full_name, avatar_url)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erro ao buscar avaliações:", error);
        return;
    }

    if (reviews.length === 0) {
        reviewsList.innerHTML = '<p>Este produto ainda não tem avaliações. Seja o primeiro!</p>';
    } else {
        reviewsList.innerHTML = reviews.map(review => {
            const avatarSrc = review.profile?.avatar_url || 'geral/img/logo/simbolo.png';
            const authorName = review.profile?.full_name || 'Usuário Anônimo';

            const imagesHTML = (review.image_urls || []).map(url =>
                `<img src="${url}" alt="Imagem da avaliação" class="review-card-image">`
            ).join('');

            const isAuthor = loggedInUserId && review.user_id === loggedInUserId;
            const canEdit = isAuthor; 
            const canDelete = isAuthor || isAdmin; 

            // Botão de Edição (só para o autor)
            const editButtonHTML = canEdit
                ? `<button class="edit-my-review-btn" 
                      data-id="${review.id}" 
                      data-rating="${review.rating}" 
                      data-comment="${encodeURIComponent(review.comment || '')}">
                       <i class="ri-pencil-line"></i> Editar
                   </button>`
                : '';
            
            // Botão de Exclusão (para o autor ou admin)
            const deleteButtonHTML = canDelete
                ? `<button class="delete-my-review-btn" data-id="${review.id}">
                     <i class="ri-delete-bin-line"></i> Excluir
                   </button>`
                : '';

            return `
            <div class="review-card">
                <header>
                    <img src="${avatarSrc}" alt="Avatar de ${authorName}" class="review-avatar">
                    <div class="review-author-info">
                        <span class="review-author-name">${authorName}</span>
                        <div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                    </div>
                </header>
                <p>${review.comment || '<i>(Sem comentário)</i>'}</p>
                <div class="review-card-images">${imagesHTML}</div>
                
                <footer>
                    <span>${new Date(review.created_at).toLocaleDateString()}</span>
                    <div class="review-author-actions">
                        ${editButtonHTML}
                        ${deleteButtonHTML}
                    </div>
                </footer>
            </div>
            `;
        }).join('');
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
        document.querySelector('.product-detail').innerHTML = '<h1>Produto não encontrado.</h1>';
        return;
    }

    showLoader(); 

    try {
        const product = await productManager.getProductById(productId);

        if (!product) {
            document.querySelector('.product-detail').innerHTML = '<h1>Produto não encontrado.</h1>';
            return;
        }
        
        renderRating(product); 

        document.title = `${product.name} • Tech Nexus`;
        document.getElementById('productImg').src = product.img || 'geral/img/placeholder.png';
        document.getElementById('brandMeta').textContent = product.brand_meta || 'Marca não informada';
        document.getElementById('sku').textContent = `SKU: ${product.sku || 'N/A'}`;
        document.getElementById('title').textContent = product.name;
        document.getElementById('desc').textContent = product.description;
        document.getElementById('price').textContent =
            `R$ ${Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('installments').textContent = product.installments || '';
        document.getElementById('stock').textContent = `Estoque: ${product.stock || 0}`;
        
        const buyBtn = document.getElementById('buyBtn');
        if (buyBtn) {
            buyBtn.addEventListener('click', () => cart.addToCart(product));
        }

        const user = await authManager.getCurrentUser();
        let isAdmin = false;
        if (user) {
            const profile = await authManager.fetchUserProfile();
            if (profile) {
                isAdmin = profile.role === 'admin';
            }
        }
        
        await fetchAndRenderReviews(productId, user ? user.id : null, isAdmin);
        
        const reviewForm = document.getElementById('review-form');
        const reviewNotice = document.getElementById('review-login-notice');
        const wishlistBtn = document.getElementById('wishlist-btn');

        const reviewEditIdInput = document.createElement('input');
        reviewEditIdInput.type = 'hidden';
        reviewEditIdInput.id = 'review-edit-id';
        reviewForm.appendChild(reviewEditIdInput);
        
        const reviewSubmitBtn = reviewForm.querySelector('button[type="submit"]');
        const originalBtnText = reviewSubmitBtn.textContent;

        if (user) {
            reviewForm.style.display = 'flex';
            reviewNotice.style.display = 'none';

            const isWishlisted = await wishlistManager.isWishlisted(productId);
            if (isWishlisted) {
                wishlistBtn.classList.add('active', 'ri-heart-fill');
                wishlistBtn.classList.remove('ri-heart-line');
            }

            const imageUploadInput = document.getElementById('review-images-upload');
            const imagePreviewContainer = document.getElementById('review-images-preview');

            imageUploadInput.addEventListener('change', () => {
                imagePreviewContainer.innerHTML = ''; 
                const files = Array.from(imageUploadInput.files);
                files.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const img = document.createElement('img');
                        img.src = reader.result;
                        img.classList.add('review-image-preview');
                        imagePreviewContainer.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            });

            // Listener para ENVIAR ou ATUALIZAR avaliação
            reviewForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!user) return;
                
                showLoader();

                const ratingInput = reviewForm.querySelector('input[name="rating"]:checked');
                const comment = document.getElementById('review-comment').value;

                // ===============================================
                // INÍCIO: VALIDAÇÃO USANDO showToast
                // ===============================================

                // 1. Validação das Estrelas
                if (!ratingInput) {
                    showToast('Por favor, selecione uma nota de 1 a 5 estrelas.', 'error');
                    hideLoader();
                    return;
                }
                
                // 2. Validação do Comentário
                if (!comment || comment.trim() === '') {
                    showToast('Por favor, escreva um comentário para sua avaliação.', 'error');
                    hideLoader();
                    return;
                }
                
                const rating = ratingInput.value;

                // ===============================================
                // FIM: VALIDAÇÃO USANDO showToast
                // ===============================================

                const reviewIdToUpdate = reviewEditIdInput.value;

                try {
                    if (reviewIdToUpdate) {
                        // --- MODO DE ATUALIZAÇÃO ---
                        const { error: updateError } = await supabase.from('reviews')
                            .update({ rating, comment })
                            .eq('id', reviewIdToUpdate)
                            .eq('user_id', user.id); 
                        if (updateError) throw updateError;
                        showToast('Avaliação atualizada com sucesso!');
                    } else {
                        // --- MODO DE INSERÇÃO (Lógica Original) ---
                        const files = document.getElementById('review-images-upload').files;
                        const imageUrls = [];
                        const uploadPromises = Array.from(files).map(async (file) => {
                            const fileName = `${user.id}/${productId}/${Date.now()}-${file.name}`;
                            const { error: uploadError } = await supabase.storage
                                .from('review-images')
                                .upload(fileName, file);
                            if (uploadError) {
                                throw new Error(`Falha no upload de ${file.name}: ${uploadError.message}`);
                            }
                            const { data } = supabase.storage.from('review-images').getPublicUrl(fileName);
                            return data.publicUrl;
                        });
                        const uploadedUrls = await Promise.all(uploadPromises);
                        imageUrls.push(...uploadedUrls);

                        const { error: insertError } = await supabase.from('reviews').insert({
                            product_id: productId,
                            user_id: user.id,
                            rating,
                            comment,
                            image_urls: imageUrls.length > 0 ? imageUrls : null,
                        });
                        if (insertError) throw insertError;
                        showToast('Avaliação enviada com sucesso!');
                    }
                    // --- Ações Pós-Sucesso (Comum a ambos) ---
                    reviewForm.reset();
                    reviewEditIdInput.value = ''; 
                    reviewSubmitBtn.textContent = originalBtnText; 
                    document.getElementById('review-images-preview').innerHTML = '';
                    
                    await fetchAndRenderReviews(productId, user.id, isAdmin); 

                    const updatedProduct = await productManager.getProductById(productId);
                    if (updatedProduct) renderRating(updatedProduct);
                } catch (error) {
                    showToast(`Erro: ${error.message}`, 'error');
                } finally {
                    hideLoader();
                }
            });
            
            // Listener para o botão de Wishlist
            wishlistBtn.addEventListener('click', async () => {
                showLoader();
                try {
                    const isCurrentlyWishlisted = wishlistBtn.classList.contains('active');
                    const success = isCurrentlyWishlisted
                        ? await wishlistManager.removeFromWishlist(productId)
                        : await wishlistManager.addToWishlist(productId);

                    if (success) {
                        wishlistBtn.classList.toggle('active');
                        wishlistBtn.classList.toggle('ri-heart-fill');
                        wishlistBtn.classList.toggle('ri-heart-line');
                        const message = isCurrentlyWishlisted
                            ? 'Produto removido da lista de desejos.'
                            : 'Produto adicionado à lista de desejos!';
                        showToast(message, 'success');
                    }
                } catch (error) {
                    showToast('Erro ao atualizar wishlist.', 'error');
                } finally {
                    hideLoader();
                }
            });

            // Listener para Excluir e Editar
            const reviewsList = document.getElementById('reviews-list');
            reviewsList.addEventListener('click', async (e) => {
                
                // --- Lógica de Excluir ---
                const deleteBtn = e.target.closest('.delete-my-review-btn');
                if (deleteBtn) {
                    const reviewId = deleteBtn.dataset.id;
                    
                    // Usa o modal de confirmação para a exclusão
                    showItemConfirmModal('Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.', async () => {
                        showLoader();
                        try {
                            const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
                            if (error) throw error;
                            
                            showToast('Avaliação excluída com sucesso!', 'success');
                            
                            await fetchAndRenderReviews(productId, user.id, isAdmin);
                            const updatedProduct = await productManager.getProductById(productId);
                            if (updatedProduct) renderRating(updatedProduct);

                        } catch (error) {
                            showToast(`Erro ao excluir avaliação: ${error.message}`, 'error');
                        } finally {
                            hideLoader();
                        }
                    });
                    return; 
                }

                // --- Lógica de Editar (só aparece para o autor) ---
                const editBtn = e.target.closest('.edit-my-review-btn');
                if (editBtn) {
                    const reviewId = editBtn.dataset.id;
                    const rating = editBtn.dataset.rating;
                    const comment = decodeURIComponent(editBtn.dataset.comment);

                    reviewEditIdInput.value = reviewId;
                    document.getElementById('review-comment').value = comment;
                    if (document.getElementById(`${rating}-stars`)) {
                        document.getElementById(`${rating}-stars`).checked = true;
                    }

                    reviewSubmitBtn.textContent = 'Atualizar Avaliação';
                    reviewForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });

        } else {
            // Se o usuário não estiver logado
            reviewForm.style.display = 'none';
            reviewNotice.style.display = 'block';
            wishlistBtn.addEventListener('click', () => {
                // Mensagem de erro para usuários não logados
                showToast('Você precisa estar logado para adicionar à wishlist.', 'error');
                window.location.href = 'login.html';
            });
        }
    } catch (error) {
        console.error("Erro ao carregar a página do produto:", error);
        document.querySelector('.product-detail').innerHTML = '<h1>Erro ao carregar produto.</h1>';
    } finally {
        hideLoader(); 
    }
});