import { Product } from '@/src/features/products/types';
import React, { createContext, ReactNode, useContext, useState } from 'react';
import { CartItem } from '../types';

interface CartContextType {
    cartItems: CartItem[];
    addToCart: (product: Product) => void;
    removeFromCart: (index: number) => void;
    updateQuantity: (index: number, delta: number) => void;
    clearCart: () => void;
    getSubtotal: () => number;
    getTax: () => number;
    getTotal: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    const addToCart = (product: Product) => {
        setCartItems((currentItems) => {
            const existingIndex = currentItems.findIndex(
                (item) => item.product.item_code === product.item_code
            );
            if (existingIndex >= 0) {
                const newItems = [...currentItems];
                newItems[existingIndex].quantity += 1;
                return newItems;
            }
            return [...currentItems, { product, quantity: 1 }];
        });
    };

    const removeFromCart = (index: number) => {
        const newCart = [...cartItems];
        newCart.splice(index, 1);
        setCartItems(newCart);
    };

    const updateQuantity = (index: number, delta: number) => {
        setCartItems((currentItems) => {
            const newItems = [...currentItems];
            const item = newItems[index];
            const newQuantity = item.quantity + delta;

            if (newQuantity <= 0) {
                // Build behavior: if 0, we can remove it or keep it at 1. 
                // Following original logic: allow 0 but maybe UI handles removal or we do nothing?
                // Original code: if (newQuantity === 0) return currentItems;
                // Let's keep it consistent: don't remove, just don't go below 1 (or 0 if that was allowed)
                // Actually, original code said: "For now, let's keep it min 1" logically, but technically allowed 0 return.
                // Let's be safe and clamp to 1 for updateQuantity, and use remove for explicit removal.
                if (newQuantity < 1) return currentItems;
            }

            item.quantity = newQuantity;
            return newItems;
        });
    };

    const clearCart = () => {
        setCartItems([]);
    };

    const getSubtotal = () => {
        return cartItems.reduce((sum, item) => sum + item.product.rate * item.quantity, 0);
    };

    const getTax = () => {
        return getSubtotal() * 0.15; // 15% VAT
    };

    const getTotal = () => {
        return getSubtotal() + getTax();
    };

    return (
        <CartContext.Provider
            value={{
                cartItems,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
                getSubtotal,
                getTax,
                getTotal,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
