# Product

## Register

brand

## Users

Sócios, empresários e líderes comerciais (30-55) que organizam eventos de conversão: workshops, lançamentos, treinamentos e imersões. Chegam via tráfego pago ou indicação da Full Sales System, geralmente no celular, avaliando se o espaço resolve o evento deles sem dor de cabeça de produção. O trabalho a ser feito: cotar datas e fechar um venue que já vem com AV, LED e credenciamento resolvidos.

## Product Purpose

Landing page do Espaço Full Sales (espacofullsales.com.br), venue de 184 lugares no Sky Corporate (Vila Olímpia, SP). O site existe para gerar leads qualificados de locação: mostrar o espaço (tour por fotos reais), listar diferenciais e converter no formulário qualificatório de 4 passos (funil FAP06 → Supabase + GHL, round-robin comercial). Sucesso = lead qualificado concluindo o formulário; o contato parte do time comercial (sem redirect pro WhatsApp).

## Brand Personality

Confiante, direto, comercial. É a estética da Full Sales System: dark premium com vermelho-coral (#ff3d57) como cor de ação, fotografia real do espaço como protagonista, copy curta orientada a conversão. Evoca "aqui o evento acontece e converte", não "salão de festas corporativo".

## Anti-references

- Sites de buffet/espaço de eventos genéricos (carrossel de fotos + formulário longo de 12 campos).
- SaaS-cream / glassmorphism decorativo. A marca já é dark comprometido, manter.
- Formulários burocráticos: o form é um quiz rápido (~90s), nunca uma ficha cadastral.

## Design Principles

1. **Foto real vence ilustração.** O espaço é o produto; imagens do venue carregam a página.
2. **Cada clique aproxima da cotação.** O form qualifica sem atrito: auto-avanço, um assunto por tela.
3. **Vermelho é ação.** #ff3d57 aparece em CTA, seleção e progresso; nunca como decoração difusa.
4. **Velocidade percebida.** Site estático leve, respostas imediatas, feedback em toda interação.
5. **Integração é sagrada.** dataLayer (GTM/Pixel) e payload da API (`api/lead.js`) não mudam de contrato em ajustes visuais.

## Accessibility & Inclusion

WCAG AA: contraste ≥4.5:1 em texto corrente, foco visível em tudo que é interativo, `prefers-reduced-motion` respeitado, alvos de toque ≥44px, formulário navegável por teclado com `<dialog>` nativo e `aria-live` para erros.
