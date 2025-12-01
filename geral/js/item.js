// Arquivo: geral/js/item.js

import { supabase } from './supabase.js';
import { productManager } from './products.js';
import { cart } from './cart.js';
// MODIFICADO: Removido 'showToast' da importação de 'ui.js'
import { renderProducts, showLoader, hideLoader } from './ui.js';
import { authManager } from './auth.js';
import { wishlistManager } from './wishlist.js';

// =======================================================
// INÍCIO: NOVA FUNÇÃO showToast (FALLBACK)
// =======================================================
/**
 * Exibe um popup de notificação (toast).
 * @param {string} message A mensagem a ser exibida.
 * @param {string} type O tipo de toast ('success' ou 'error').
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error('Container de Toast não encontrado!');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`; // 'success' ou 'error'
    toast.textContent = message;

    container.prepend(toast); // Adiciona no topo

    // Faz a animação de entrada
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); // Pequeno delay para garantir que a transição CSS ocorra

    // Define um tempo para esconder
    setTimeout(() => {
        toast.classList.add('hide');
    }, 3000); // Fica visível por 3 segundos

    setTimeout(() => {
        toast.remove();
    }, 3400); // 3000ms (visível) + 400ms (animação de saída)
}
// =======================================================
// FIM: NOVA FUNÇÃO showToast
// =======================================================


// =======================================================
// LÓGICA DO MODAL DE CONFIRMAÇÃO (COPIADO DO ADMIN.JS)
// =======================================================
/**
 * Exibe um modal de confirmação genérico.
 * @param {string} message A mensagem a ser exibida no modal.
 * @param {function} onConfirmCallback A função a ser executada se o admin confirmar.
 */
function showAdminConfirmModal(message, onConfirmCallback) {
    const modal = document.getElementById('admin-confirm-modal');
    const messageEl = document.getElementById('admin-confirm-message');
    const confirmBtn = document.getElementById('admin-confirm-yes');
    const cancelBtn = document.getElementById('confirm-cancel');
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

            // MODIFICADO: Adiciona a classe 'clickable-review-image'
            const imagesHTML = (review.image_urls || []).map(url =>
                `<img src="${url}" alt="Imagem da avaliação" class="review-card-image clickable-review-image">`
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

        // ===============================================
        // Variáveis do Modal de Imagem (definidas aqui para escopo)
        // ===============================================
        const imageModal = document.getElementById('image-modal-overlay');
        const modalImg = document.getElementById('modal-image-content');
        const imageModalCloseBtn = document.getElementById('image-modal-close');

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
            
            // ARRAY PARA ARMAZENAR AS IMAGENS TEMPORARIAMENTE
            let storedReviewFiles = []; 

            if (imageUploadInput) {
                // Função para renderizar as imagens acumuladas
                const updateImagePreviews = () => {
                    imagePreviewContainer.innerHTML = ''; // Limpa visualização
                    
                    storedReviewFiles.forEach((file, index) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            // Cria um wrapper (div) para conter a imagem e o botão
                            const wrapper = document.createElement('div');
                            wrapper.className = 'image-preview-wrapper';

                            const img = document.createElement('img');
                            img.src = reader.result;
                            img.classList.add('review-image-preview'); // Classe CSS ajustada

                            // Cria o botão de remover
                            const removeBtn = document.createElement('button');
                            removeBtn.innerHTML = '×';
                            removeBtn.className = 'remove-image-btn';
                            removeBtn.type = 'button'; // Importante para não submeter o form
                            
                            // Ação de remover
                            removeBtn.onclick = () => {
                                storedReviewFiles.splice(index, 1); // Remove do array
                                updateImagePreviews(); // Re-renderiza
                            };

                            wrapper.appendChild(img);
                            wrapper.appendChild(removeBtn);
                            imagePreviewContainer.appendChild(wrapper);
                        };
                        reader.readAsDataURL(file);
                    });
                };

                // Listener de CHANGE (Adicionar novas fotos sem perder as antigas)
                imageUploadInput.addEventListener('change', () => {
                    const newFiles = Array.from(imageUploadInput.files);
                    // Adiciona os novos arquivos ao nosso array acumulador
                    storedReviewFiles = storedReviewFiles.concat(newFiles);
                    
                    updateImagePreviews();
                    
                    // Limpa o input HTML para permitir selecionar a mesma foto novamente se quiser
                    imageUploadInput.value = ''; 
                });
            }

            // Listener para ENVIAR ou ATUALIZAR avaliação
            reviewForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!user) return;

                const ratingInput = reviewForm.querySelector('input[name="rating"]:checked');
                const comment = document.getElementById('review-comment').value;

                // 1. Validação das Estrelas
                if (!ratingInput) {
                    showToast('Por favor, selecione uma nota de 1 a 5 estrelas.', 'error');
                    return;
                }
                // 2. Validação do Comentário
                if (!comment || comment.trim() === '') {
                    showToast('Por favor, escreva um comentário para sua avaliação.', 'error');
                    return;
                }

                const rating = ratingInput.value;
                showLoader();

                const reviewIdToUpdate = reviewEditIdInput.value;

                try {
                    if (reviewIdToUpdate) {
                        // ... (LÓGICA DE ATUALIZAÇÃO - MANTENHA IGUAL AO SEU CÓDIGO ORIGINAL) ...
                        // Nota: Se você permite adicionar fotos na edição, precisaria adaptar aqui também, 
                        // mas vou focar na lógica principal que você pediu.
                         showAdminConfirmModal('Tem certeza que deseja atualizar esta avaliação?', async () => {
                             // ... (copie a logica interna do seu update aqui)
                             // Ao final do sucesso do update, limpe o array:
                             storedReviewFiles = []; 
                         });
                         hideLoader();
                    } else {
                        // --- MODO DE INSERÇÃO (MODIFICADO) ---
                        
                        // IMPORTANTE: Agora usamos 'storedReviewFiles' em vez do input direto
                        const files = storedReviewFiles; 
                        
                        const imageUrls = [];
                        const uploadPromises = files.map(async (file) => {
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

                        // Limpa o formulário e recarrega
                        reviewForm.reset();
                        reviewEditIdInput.value = '';
                        reviewSubmitBtn.textContent = originalBtnText;
                        
                        // LIMPA NOSSO ARRAY E O PREVIEW
                        storedReviewFiles = [];
                        document.getElementById('review-images-preview').innerHTML = '';

                        await fetchAndRenderReviews(productId, user.id, isAdmin);
                        const updatedProduct = await productManager.getProductById(productId);
                        if (updatedProduct) renderRating(updatedProduct);
                    }
                } catch (error) {
                    showToast(`Erro: ${error.message}`, 'error');
                } finally {
                    if (!reviewIdToUpdate) hideLoader();
                }
            });

            // Listener para ENVIAR ou ATUALIZAR avaliação
            reviewForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!user) return;

                const ratingInput = reviewForm.querySelector('input[name="rating"]:checked');
                const comment = document.getElementById('review-comment').value;

                // ===============================================
                // INÍCIO: VALIDAÇÃO USANDO showToast (MODIFICADO)
                // ===============================================

                // 1. Validação das Estrelas
                if (!ratingInput) {
                    // USA O NOVO showToast
                    showToast('Por favor, selecione uma nota de 1 a 5 estrelas.', 'error');
                    return; // Para a execução
                }

                // 2. Validação do Comentário
                if (!comment || comment.trim() === '') {
                    // USA O NOVO showToast
                    showToast('Por favor, escreva um comentário para sua avaliação.', 'error');
                    return; // Para a execução
                }

                const rating = ratingInput.value;

                // ===============================================
                // FIM: VALIDAÇÃO USANDO showToast
                // ===============================================

                // Só mostra o loader APÓS a validação
                showLoader();

                const reviewIdToUpdate = reviewEditIdInput.value;

                try {
                    if (reviewIdToUpdate) {
                        // --- MODO DE ATUALIZAÇÃO (MODIFICADO) ---
                        // Pede confirmação ANTES de atualizar
                        showAdminConfirmModal('Tem certeza que deseja atualizar esta avaliação?', async () => {
                            showLoader(); // Mostra loader para a ação de atualizar
                            try {
                                const { error: updateError } = await supabase.from('reviews')
                                    .update({ rating, comment })
                                    .eq('id', reviewIdToUpdate)
                                    .eq('user_id', user.id);
                                if (updateError) throw updateError;
                                showToast('Avaliação atualizada com sucesso!');

                                // Limpa o formulário e recarrega
                                reviewForm.reset();
                                reviewEditIdInput.value = '';
                                reviewSubmitBtn.textContent = originalBtnText;
                                document.getElementById('review-images-preview').innerHTML = '';

                                await fetchAndRenderReviews(productId, user.id, isAdmin);
                                const updatedProduct = await productManager.getProductById(productId);
                                if (updatedProduct) renderRating(updatedProduct);

                            } catch (error) {
                                showToast(`Erro ao atualizar: ${error.message}`, 'error');
                            } finally {
                                hideLoader();
                            }
                        });
                        hideLoader(); // Esconde o loader inicial, pois estamos esperando o modal

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

                        // Limpa o formulário e recarrega
                        reviewForm.reset();
                        reviewEditIdInput.value = '';
                        reviewSubmitBtn.textContent = originalBtnText;
                        document.getElementById('review-images-preview').innerHTML = '';

                        await fetchAndRenderReviews(productId, user.id, isAdmin);
                        const updatedProduct = await productManager.getProductById(productId);
                        if (updatedProduct) renderRating(updatedProduct);
                    }
                } catch (error) {
                    showToast(`Erro: ${error.message}`, 'error');
                } finally {
                    // Garante que o loader seja escondido se a inserção (não-atualização) falhar
                    if (!reviewIdToUpdate) {
                        hideLoader();
                    }
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

                // --- Lógica de Excluir (MODIFICADO) ---
                const deleteBtn = e.target.closest('.delete-my-review-btn');
                if (deleteBtn) {
                    const reviewId = deleteBtn.dataset.id;

                    // Usa o modal de confirmação do ADMIN para a exclusão
                    showAdminConfirmModal('Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.', async () => {
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

        // ===============================================
        // INÍCIO: LÓGICA DO MODAL DE IMAGEM
        // ===============================================
        const reviewsListContainer = document.getElementById('reviews-list');

        // As variáveis (imageModal, modalImg, imageModalCloseBtn) já foram definidas acima

        if (reviewsListContainer && imageModal && modalImg && imageModalCloseBtn) {
            // Abre o modal ao clicar na imagem
            reviewsListContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('clickable-review-image')) {
                    modalImg.src = e.target.src;
                    imageModal.classList.add('show');
                }
            });

            // Fecha o modal ao clicar no 'X'
            imageModalCloseBtn.addEventListener('click', () => {
                imageModal.classList.remove('show');
            });

            // Fecha o modal ao clicar no overlay
            imageModal.addEventListener('click', (e) => {
                if (e.target === imageModal) {
                    imageModal.classList.remove('show');
                }
            });
        }
        // ===============================================
        // FIM: LÓGICA DO MODAL DE IMAGEM
        // ===============================================


    } catch (error) {
        console.error("Erro ao carregar a página do produto:", error);
        document.querySelector('.product-detail').innerHTML = '<h1>Erro ao carregar produto.</h1>';
    } finally {
        hideLoader();
    }
});