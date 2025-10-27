// Arquivo: geral/js/cart.js
import { showToast, updateCartBadge } from './ui.js';

class Cart {
    constructor() {
        this.cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    }

    getCart() {
        return this.cart;
    }

    saveCart() {
        localStorage.setItem('shoppingCart', JSON.stringify(this.cart));
        updateCartBadge();
    }

    addToCart(product, quantity = 1) {
        // Garante que o ID do produto seja uma string ANTES de ser salvo
        const productId = String(product.id);
        const existingItem = this.cart.find(item => String(item.id) === productId);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            // Salva o ID como string
            this.cart.push({ ...product, id: productId, quantity });
        }

        showToast(`${product.name} adicionado ao carrinho!`);
        this.saveCart();
    }

    removeFromCart(productId) {
        // 🔥 CORREÇÃO: Força a comparação de STRING para STRING
        const productIdStr = String(productId);
        this.cart = this.cart.filter(item => String(item.id) !== productIdStr);
        
        showToast('Item removido do carrinho.');
        this.saveCart();
        
        if (window.location.pathname.includes('cart.html')) {
            this.renderCartPage(); 
        }
    }

    updateQuantity(productId, quantity) {
        // 🔥 CORREÇÃO: Força a comparação de STRING para STRING
        const productIdStr = String(productId);
        const item = this.cart.find(item => String(item.id) === productIdStr);
        
        if (item) {
            if (quantity <= 0) {
                this.removeFromCart(productIdStr); // Passa a string
            } else {
                item.quantity = quantity;
                this.saveCart(); 
                
                if (window.location.pathname.includes('cart.html')) {
                    this.renderCartPage();
                }
            }
        }
    }

    getCartTotal() {
        return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getCartItemCount() {
        return this.cart.reduce((total, item) => total + item.quantity, 0);
    }

    clearCart() {
        this.cart = [];
        this.saveCart();
    }

    renderCartPage() {
        const itemsContainer = document.getElementById('cart-items');
        const subtotalContainer = document.getElementById('cart-subtotal');
        const shippingContainer = document.getElementById('cart-shipping');
        const totalContainer = document.getElementById('cart-total');

        if (!itemsContainer) return;

        const savedShipping = JSON.parse(sessionStorage.getItem('shippingInfo'));
        const shippingCost = savedShipping ? savedShipping.price : 0;

        const subtotal = this.getCartTotal();
        const total = subtotal + shippingCost;

        const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        if (this.cart.length === 0) {
            if(document.getElementById('order-confirmation')?.style.display !== 'flex') {
                itemsContainer.innerHTML = '<p>Seu carrinho está vazio.</p>';
            }
        } else {
            itemsContainer.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <img src="${item.img || 'geral/img/logo/simbolo.png'}" alt="${item.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <h4>${item.name}</h4>
                        <p class="cart-item-price">${formatCurrency(item.price)}</p>
                        <div class="cart-item-actions">
                            <div class="quantity-wrapper">
                                <button class="qty-btn" data-id="${item.id}" data-action="decrease">-</button>
                                <input type="number" class="cart-item-quantity" value="${item.quantity}" min="1" data-id="${item.id}">
                                <button class="qty-btn" data-id="${item.id}" data-action="increase">+</button>
                            </div>
                            <button class="cart-item-remove" data-id="${item.id}"><i class="ri-delete-bin-line"></i> Remover</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        if(subtotalContainer) subtotalContainer.textContent = formatCurrency(subtotal);
        if(shippingContainer) shippingContainer.textContent = formatCurrency(shippingCost);
        if(totalContainer) totalContainer.textContent = formatCurrency(total);

        window.dispatchEvent(new CustomEvent('cartUpdated'));
    }
}

export const cart = new Cart();