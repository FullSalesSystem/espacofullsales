// Espaço Full Sales · versão de nov/2026. Só layout: o formulário, o envio e os eventos são do script.js.
// "Ver mais" no celular (diferenciais e tabela de entregas)
document.querySelectorAll('[data-collapse]').forEach(btn=>{const alvo=document.querySelector(btn.dataset.collapse);if(!alvo)return;alvo.classList.add('is-collapsed');btn.addEventListener('click',()=>{const fechado=alvo.classList.toggle('is-collapsed');btn.textContent=fechado?btn.dataset.more:btn.dataset.less;btn.setAttribute('aria-expanded',String(!fechado));if(fechado)alvo.scrollIntoView({block:'start'});});});
// Botão de pausar a faixa de quem já passou pelo espaço
const motionToggle=document.querySelector('.motion-toggle');if(motionToggle)motionToggle.addEventListener('click',()=>{const paused=document.querySelector('.people-marquee').classList.toggle('is-paused');motionToggle.textContent=paused?'Retomar faixa':'Pausar faixa';motionToggle.setAttribute('aria-pressed',String(paused));});
