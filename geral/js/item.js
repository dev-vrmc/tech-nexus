// Arquivo: geral/js/item.js (SUBSTITUIR TODO O ANTIGO COM ESTE)
// Dependências assumidas: supabase.js, products.js, cart.js, ui.js, auth.js, wishlist.js
import { supabase } from './supabase.js';
import { productManager } from './products.js';
import { cart } from './cart.js';
import { renderProducts, showLoader, hideLoader } from './ui.js';
import { authManager } from './auth.js';
import { wishlistManager } from './wishlist.js';

/* -----------------------
   Helper: showToast (fallback)
   ----------------------- */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.error('Toast container not found');
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.prepend(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.add('hide'), 3000);
  setTimeout(() => toast.remove(), 3400);
}

/* -----------------------
   Modal genérico de confirmação
   ----------------------- */
function showAdminConfirmModal(message, onConfirmCallback) {
  const modal = document.getElementById('admin-confirm-modal');
  const messageEl = document.getElementById('admin-confirm-message');
  const confirmBtn = document.getElementById('admin-confirm-yes');
  const cancelBtn = document.getElementById('confirm-cancel');

  if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
    if (confirm(message)) onConfirmCallback();
    return;
  }

  messageEl.textContent = message;

  // Limpa listeners antigos trocando os botões por clones
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  const newCancel = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

  const hide = () => modal.classList.remove('show');

  newConfirm.addEventListener('click', () => { onConfirmCallback(); hide(); });
  newCancel.addEventListener('click', hide);

  modal.classList.add('show');
}

/* -----------------------
   Render rating
   ----------------------- */
function renderRating(product) {
  const container = document.getElementById('product-rating-container');
  if (!container) return;
  // Considera apenas reviews aprovados para a média (idealmente o backend faria isso, mas visualmente ajustamos aqui se necessário)
  if (!product.review_count || product.review_count === 0) {
    container.innerHTML = `<p class="no-reviews">Este produto ainda não tem avaliações aprovadas.</p>`;
    return;
  }
  const rating = product.average_rating || 0;
  const count = product.review_count;
  let starsHTML = '';
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.4 ? 1 : 0;
  const emptyStars = 5 - fullStars - halfStar;
  for (let i = 0; i < fullStars; i++) starsHTML += '<i class="ri-star-fill"></i>';
  if (halfStar) starsHTML += '<i class="ri-star-half-fill"></i>';
  for (let i = 0; i < emptyStars; i++) starsHTML += '<i class="ri-star-line"></i>';
  const ratingText = parseFloat(rating).toFixed(1).replace('.', ',');
  const reviewText = count === 1 ? 'avaliação' : 'avaliações';
  container.innerHTML = `
    <div class="stars">${starsHTML}</div>
    <span class="rating-value">${ratingText}</span>
    <span class="review-count">(${count} ${reviewText})</span>
  `;
}
/* -----------------------
   Buscar e renderizar reviews (agora inclui data-images no botão editar)
   ----------------------- */
async function fetchAndRenderReviews(productId, loggedInUserId, isAdmin = false) {
  const reviewsList = document.getElementById('reviews-list');
  if (!reviewsList) return;

  // Busca TODOS os reviews do banco
  let { data: reviews, error } = await supabase
    .from('reviews')
    .select('*, profile:profiles(full_name, avatar_url)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar avaliações:', error);
    reviewsList.innerHTML = '<p>Erro ao carregar avaliações.</p>';
    return;
  }

  // --- FILTRAGEM RIGOROSA ---
  // 1. Review Aprovado (approved === true)
  // 2. OU Sou o Admin
  // 3. OU Sou o dono da review (para ver meu status pendente)
  const visibleReviews = reviews.filter(r => {
    const isApproved = r.approved === true;
    const isMyReview = loggedInUserId && String(r.user_id) === String(loggedInUserId);
    return isApproved || isAdmin || isMyReview;
  });

  if (!visibleReviews || visibleReviews.length === 0) {
    reviewsList.innerHTML = '<p>Este produto ainda não tem avaliações públicas.</p>';
    return;
  }

  reviewsList.innerHTML = visibleReviews.map(review => {
    const avatarSrc = review.profile?.avatar_url || 'geral/img/logo/simbolo.png';
    const authorName = review.profile?.full_name || 'Usuário Anônimo';
    const images = review.image_urls || [];
    const imagesHTML = images.map(url => `<img src="${url}" alt="Imagem da avaliação" class="review-card-image clickable-review-image">`).join('');
    
    // Identifica se é o autor logado
    const isAuthor = loggedInUserId && String(review.user_id) === String(loggedInUserId);
    
    // Lógica das Badges
    let statusBadge = '';
    let cardClass = '';

    // Se NÃO for aprovado
    if (review.approved !== true) {
        if (isAuthor) {
            statusBadge = `<span class="review-status-badge status-pending">Em análise (Visível apenas para você)</span>`;
            cardClass = 'pending-review'; // Adiciona estilo tracejado/transparente
        } else if (isAdmin) {
             statusBadge = `<span class="review-status-badge status-pending">Pendente de Aprovação</span>`;
             cardClass = 'pending-review';
        }
    }

    const editButtonHTML = isAuthor ? `<button class="edit-my-review-btn" 
                                  data-id="${review.id}" 
                                  data-rating="${review.rating}" 
                                  data-comment="${encodeURIComponent(review.comment || '')}"
                                  data-images='${encodeURIComponent(JSON.stringify(images))}'>
                                  <i class="ri-pencil-line"></i> Editar
                                </button>` : '';
                                
    const deleteButtonHTML = (isAuthor || isAdmin) ? `<button class="delete-my-review-btn" data-id="${review.id}"><i class="ri-delete-bin-line"></i> Excluir</button>` : '';

    return `
      <div class="review-card ${cardClass}" data-review-id="${review.id}">
        <header>
          <img src="${avatarSrc}" alt="Avatar de ${authorName}" class="review-avatar">
          <div class="review-author-info">
            <span class="review-author-name">${authorName} ${statusBadge}</span>
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

/* -----------------------
   Código principal - DOMContentLoaded
   ----------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  if (!productId) { document.querySelector('.product-detail').innerHTML = '<h1>Produto não encontrado.</h1>'; return; }

  showLoader();

  try {
    const product = await productManager.getProductById(productId);
    if (!product) { document.querySelector('.product-detail').innerHTML = '<h1>Produto não encontrado.</h1>'; return; }

    renderRating(product);
    document.title = `${product.name} • Tech Nexus`;
    document.getElementById('productImg').src = product.img || 'geral/img/placeholder.png';
    document.getElementById('brandMeta').textContent = product.brand_meta || 'Marca não informada';
    document.getElementById('sku').textContent = `SKU: ${product.sku || 'N/A'}`;
    document.getElementById('title').textContent = product.name;
    document.getElementById('desc').textContent = product.description;
    document.getElementById('price').textContent = `R$ ${Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('installments').textContent = product.installments || '';
    // --- LÓGICA DE ESTOQUE ATUALIZADA ---
    const stockCount = product.stock || 0;
    document.getElementById('stock').textContent = `Estoque: ${stockCount}`;

    const buyBtn = document.getElementById('buyBtn');
    
    if (buyBtn) {
      if (stockCount <= 0) {
        buyBtn.textContent = 'Fora de Estoque'; 
        buyBtn.disabled = true;                
        buyBtn.style.background = 'var(--container-color)';   
        buyBtn.style.color = 'var(--text-color)';            
        buyBtn.style.cursor = 'not-allowed';    
        buyBtn.style.border = '1px solid #999'; 
      } else {
        buyBtn.addEventListener('click', () => cart.addToCart(product));
      }
    }

    const user = await authManager.getCurrentUser();
    let isAdmin = false;
    if (user) {
      const profile = await authManager.fetchUserProfile();
      if (profile) isAdmin = profile.role === 'admin';
    }

    await fetchAndRenderReviews(productId, user ? user.id : null, isAdmin);

    // ELEMENTOS
    const reviewForm = document.getElementById('review-form');
    const reviewNotice = document.getElementById('review-login-notice');
    const wishlistBtn = document.getElementById('wishlist-btn');
    const reviewSubmitBtn = reviewForm.querySelector('button[type="submit"]');
    const originalBtnText = reviewSubmitBtn.textContent;
    const reviewComment = document.getElementById('review-comment');
    const imageInput = document.getElementById('review-images-upload');
    const previewBox = document.getElementById('review-images-preview');
    const reviewsList = document.getElementById('reviews-list');

    // Hidden input for edit id
    const reviewEditIdInput = document.createElement('input');
    reviewEditIdInput.type = 'hidden';
    reviewEditIdInput.id = 'review-edit-id';
    reviewForm.appendChild(reviewEditIdInput);

    // State
    let storedReviewFiles = [];    // File objects newly added
    let storedExistingImages = []; // URLs of images that belong to the review (from DB)
    let currentEditingId = null;

    // If user logged, show form and init wishlist button
    if (user) {
      reviewForm.style.display = 'flex';
      reviewNotice.style.display = 'none';

      const isWish = await wishlistManager.isWishlisted(productId);
      if (isWish) wishlistBtn.classList.add('active', 'ri-heart-fill');

      // Image input change -> accumulate files + update preview
      if (imageInput) {
        imageInput.addEventListener('change', () => {
          const newFiles = Array.from(imageInput.files || []);
          if (newFiles.length) {
            storedReviewFiles = storedReviewFiles.concat(newFiles);
            imageInput.value = ''; // allow selecting same files again
            updatePreview();
          }
        });
      }

      // Preview render function (shows existing + new files)
      function updatePreview() {
        previewBox.innerHTML = '';

        // Existing images (URLs)
        storedExistingImages.forEach((url, idx) => {
          const wrap = document.createElement('div');
          wrap.className = 'image-preview-wrapper';

          const img = document.createElement('img');
          img.src = url;
          img.className = 'review-image-preview';

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'remove-image-btn';
          btn.innerText = '×';
          btn.onclick = () => {
            storedExistingImages.splice(idx, 1);
            updatePreview();
          };

          wrap.appendChild(img);
          wrap.appendChild(btn);
          previewBox.appendChild(wrap);
        });

        // New images (File objects)
        storedReviewFiles.forEach((file, idx) => {
          const reader = new FileReader();
          reader.onload = () => {
            const wrap = document.createElement('div');
            wrap.className = 'image-preview-wrapper';

            const img = document.createElement('img');
            img.src = reader.result;
            img.className = 'review-image-preview';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'remove-image-btn';
            btn.innerText = '×';
            btn.onclick = () => {
              storedReviewFiles.splice(idx, 1);
              updatePreview();
            };

            wrap.appendChild(img);
            wrap.appendChild(btn);
            previewBox.appendChild(wrap);
          };
          reader.readAsDataURL(file);
        });
      }

      // Single submit listener (insert or update)
      reviewForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!user) return showToast('Faça login para enviar avaliações.', 'error');

        const ratingInput = reviewForm.querySelector('input[name="rating"]:checked');
        const comment = reviewComment.value?.trim();

        if (!ratingInput) return showToast('Selecione a nota (estrelas).', 'error');
        if (!comment) return showToast('Escreva um comentário.', 'error');

        const rating = parseInt(ratingInput.value, 10);
        showLoader();

        try {
          // Upload novas imagens (se houver)
          const uploadedUrls = [];
          for (const file of storedReviewFiles) {
            const filePath = `${user.id}/${productId}/${Date.now()}-${file.name}`;
            const { error: uploadErr } = await supabase.storage.from('review-images').upload(filePath, file);
            if (uploadErr) throw uploadErr;
            const { data } = supabase.storage.from('review-images').getPublicUrl(filePath);
            uploadedUrls.push(data.publicUrl);
          }

          // Final images = imagens que ficaram (existing) + novas (upload)
          const finalImages = [...storedExistingImages, ...uploadedUrls];
          const imagesPayload = finalImages.length ? finalImages : null;

          // Se estiver editando
          if (currentEditingId) {
            // Confirma antes de atualizar
            await new Promise((resolve, reject) => {
              showAdminConfirmModal('Tem certeza que deseja atualizar esta avaliação?', async () => {
                try {
                  const { error: updateError } = await supabase.from('reviews')
                    .update({ rating, comment, image_urls: imagesPayload })
                    .eq('id', currentEditingId)
                    .eq('user_id', user.id);
                  if (updateError) throw updateError;
                  showToast('Avaliação atualizada com sucesso!', 'success');
                  resolve();
                } catch (err) {
                  showToast(`Erro ao atualizar: ${err.message}`, 'error');
                  reject(err);
                }
              });
            });
          } else {
            // Inserir nova avaliação
            const { error: insertError } = await supabase.from('reviews').insert({
              product_id: productId,
              user_id: user.id,
              rating,
              comment,
              image_urls: imagesPayload
            });
            if (insertError) throw insertError;
            showToast('Avaliação enviada com sucesso!', 'success');
          }

          // Reset de estado
          reviewForm.reset();
          storedReviewFiles = [];
          storedExistingImages = [];
          currentEditingId = null;
          reviewEditIdInput.value = '';
          reviewSubmitBtn.textContent = originalBtnText;
          previewBox.innerHTML = '';

          // Recarrega lista e rating
          await fetchAndRenderReviews(productId, user.id, isAdmin);
          const updatedProduct = await productManager.getProductById(productId);
          if (updatedProduct) renderRating(updatedProduct);
        } catch (err) {
          showToast(err.message || 'Erro ao enviar avaliação.', 'error');
        } finally {
          hideLoader();
        }
      });

      // Wishlist button
      wishlistBtn.addEventListener('click', async () => {
        showLoader();
        try {
          const isCurrently = wishlistBtn.classList.contains('active');
          const success = isCurrently ? await wishlistManager.removeFromWishlist(productId) : await wishlistManager.addToWishlist(productId);
          if (success) {
            wishlistBtn.classList.toggle('active');
            wishlistBtn.classList.toggle('ri-heart-fill');
            wishlistBtn.classList.toggle('ri-heart-line');
            showToast(isCurrently ? 'Removido da wishlist' : 'Adicionado à wishlist', 'success');
          }
        } catch (err) {
          showToast('Erro ao atualizar wishlist', 'error');
        } finally { hideLoader(); }
      });

      // Delegation para editar/excluir dentro da lista de reviews
      reviewsList.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-my-review-btn');
        if (deleteBtn) {
          const id = deleteBtn.dataset.id;
          showAdminConfirmModal('Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.', async () => {
            showLoader();
            try {
              const { error } = await supabase.from('reviews').delete().eq('id', id);
              if (error) throw error;
              showToast('Avaliação excluída', 'success');
              await fetchAndRenderReviews(productId, user.id, isAdmin);
              const updatedProduct = await productManager.getProductById(productId);
              if (updatedProduct) renderRating(updatedProduct);
            } catch (err) {
              showToast(`Erro ao excluir: ${err.message}`, 'error');
            } finally { hideLoader(); }
          });
          return;
        }

        const editBtn = e.target.closest('.edit-my-review-btn');
        if (editBtn) {
          // Pega dados do botão (incluindo images JSON codificado)
          const id = editBtn.dataset.id;
          const rating = editBtn.dataset.rating;
          const comment = decodeURIComponent(editBtn.dataset.comment || '');
          const imagesJSON = editBtn.dataset.images ? decodeURIComponent(editBtn.dataset.images) : '[]';
          let images = [];
          try { images = JSON.parse(imagesJSON); } catch(_) { images = []; }

          // Popula estado para edição
          currentEditingId = id;
          storedExistingImages = Array.isArray(images) ? images.slice() : [];
          storedReviewFiles = [];

          reviewEditIdInput.value = id;
          reviewComment.value = comment;
          if (document.getElementById(`${rating}-stars`)) document.getElementById(`${rating}-stars`).checked = true;
          reviewSubmitBtn.textContent = 'Atualizar Avaliação';
          updatePreview();
          reviewForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      // Image modal (abrir ao clicar em imagem de review)
      const imageModal = document.getElementById('image-modal-overlay');
      const modalImg = document.getElementById('modal-image-content');
      const imageModalCloseBtn = document.getElementById('image-modal-close');
      reviewsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('clickable-review-image')) {
          modalImg.src = e.target.src;
          imageModal.classList.add('show');
        }
      });
      if (imageModalCloseBtn) imageModalCloseBtn.addEventListener('click', () => imageModal.classList.remove('show'));
      if (imageModal) imageModal.addEventListener('click', (ev) => { if (ev.target === imageModal) imageModal.classList.remove('show'); });
    } else {
      // usuário não logado
      reviewForm.style.display = 'none';
      reviewNotice.style.display = 'block';
      wishlistBtn.addEventListener('click', () => {
        showToast('Você precisa estar logado para adicionar à wishlist.', 'error');
        window.location.href = 'login.html';
      });
    }
  } catch (err) {
    console.error('Erro ao carregar page item.js:', err);
    document.querySelector('.product-detail').innerHTML = '<h1>Erro ao carregar produto.</h1>';
  } finally {
    hideLoader();
  }
});
