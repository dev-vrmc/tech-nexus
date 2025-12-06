// Arquivo: geral/js/supabase.js

// MUDANÇA AQUI: Usando uma versão específica (2.39.7) ao invés da genérica @2
// Isso evita quebras quando a biblioteca atualiza e garante compatibilidade mobile
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Configurações do seu projeto (MANTENHA AS SUAS CHAVES)
const supabaseUrl = 'https://brjtxgmvjpjovxsncild.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyanR4Z212anBqb3Z4c25jaWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjU0MTQsImV4cCI6MjA3NTI0MTQxNH0.gzIhyCBS6GOi6xwZMrwVGWNsJ0SlMqhwEXaDIsRgiLw';

// Criação do cliente com configuração explícita de armazenamento (ajuda no mobile)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        storageKey: 'tech-nexus-auth', // Nome único para não conflitar com outros sites
        storage: window.localStorage,  // Força o uso do localStorage do navegador
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});