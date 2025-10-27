/* ==============================================
   ARQUIVO: geral/js/intro.js (VERSÃO 4.0 - SURTO DE LINHAS)
   Lógica e Animação GSAP para o "Trailer" Holográfico
   ============================================== */

document.addEventListener("DOMContentLoaded", () => {
  // Armazena as animações de rotação para poder "matá-las" depois
  let ringAnimations = [];

  // Pega o botão de pular
  const skipButton = document.querySelector(".intro-skip");

  // Cria a timeline principal do GSAP
  const tl = gsap.timeline({
    onComplete: redirectToHome,
    paused: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });

  // Event listener para o botão de pular
  skipButton.addEventListener("click", () => {
    // Mata a timeline
    tl.kill();
    
    // Mata as animações de rotação
    ringAnimations.forEach((anim) => anim.kill());
    
    // Vai direto para a função de redirecionar
    redirectToHome();
  });

  // --- INÍCIO DA SEQUÊNCIA DE ANIMAÇÃO ---
  // A duração total é de aprox. 6.5-7 segundos

  // 1. Fade-in inicial do overlay e do botão de pular
  tl.to("#intro-overlay", { autoAlpha: 1, duration: 0.5 });
  tl.to(".intro-skip", { autoAlpha: 1, duration: 0.5 }, "-=0.3");

  // 2. Animação dos Orbs de fundo
  tl.to(
    ".intro-orbs .orb",
    {
      autoAlpha: 0.14,
      scale: 1,
      stagger: 0.2,
      duration: 1,
      ease: "power2.out",
    },
    "<"
  );

  // 3. Animação do Holograma (Logo + Anéis)
  tl.to(
    ".intro-holo",
    {
      autoAlpha: 1,
      scale: 1,
      duration: 1,
      ease: "back.out(1.4)",
    },
    "-=0.5"
  );

  // 4. Animação dos Anéis girando
  tl.to(
    ".holo-ring",
    {
      autoAlpha: (i) => (i === 0 ? 0.9 : i === 1 ? 0.5 : 0.3), // i=0: ring-1, i=1: ring-2, i=2: ring-3
      scale: 1,
      stagger: 0.1,
      duration: 1,
      ease: "back.out(1.7)",
    },
    "-=0.8"
  );

  // Faz os anéis girarem infinitamente E ARMAZENA AS ANIMAÇÕES
  ringAnimations.push(
    gsap.to(".holo-ring.ring-1", {
      rotation: 360,
      duration: 10,
      repeat: -1,
      ease: "none",
    })
  );
  ringAnimations.push(
    gsap.to(".holo-ring.ring-2", {
      rotation: -360,
      duration: 8,
      repeat: -1,
      ease: "none",
    })
  );
  ringAnimations.push(
    gsap.to(".holo-ring.ring-3", {
      rotation: 360,
      duration: 12,
      repeat: -1,
      ease: "none",
    })
  );

  /* ==============================================
     NOVA SEQUÊNCIA DE ANIMAÇÃO (ETAPAS 5, 6, 7)
     Substituindo o .holo-core pelo .energy-burst
     ============================================== */

  // 5. NOVO: Animação do "Surto de Linhas" (energy-burst)
  // O container das linhas aparece
  tl.to(
    ".energy-burst",
    {
      autoAlpha: 1,
      duration: 0.1, // Aparece instantaneamente
    },
    "-=1.0" // Começa um pouco depois dos anéis aparecerem
  );

  // 6. NOVO: As linhas "explodem" do centro
  tl.to(
    ".energy-burst .energy-line",
    {
      autoAlpha: 1,
      scaleX: 1, // Expande do centro para fora
      stagger: 0.08, // Uma linha de cada vez, bem rápido
      duration: 0.5,
      ease: "power2.out",
    },
    "<" // Ocorre ao MESMO TEMPO que o container aparece
  );

  // 7. NOVO: Animação do Logo (EXPLODINDO *com* o surto)
  tl.to(
    ".intro-logo",
    {
      autoAlpha: 1,
      scale: 1,
      duration: 0.9,
      ease: "back.out(2.5)", // Um "pop" bem forte
    },
    "<" // O logo aparece JUNTO com o surto de linhas
  );
  
  // 8. NOVO: As linhas de energia desaparecem
  // Elas transferem a energia para o logo e somem
  tl.to(
    ".energy-burst .energy-line",
    {
      autoAlpha: 0,
      duration: 0.4,
      ease: "power1.in",
    },
    "-=0.3" // Começa a sumir 0.3s depois de aparecerem
  );

  /* ==============================================
     FIM DA NOVA SEQUÊNCIA
     ============================================== */

  // 9. Animação do Título ("TECH" e "NEXUS") - (Era a Etapa 8)
  tl.to(
    ".intro-word",
    {
      autoAlpha: 1,
      rotateX: 0,
      scale: 1,
      stagger: 0.2,
      duration: 1,
      ease: "back.out(1.2)",
    },
    "-=0.6" // Ajustado o timing para fluir com a explosão do logo
  );

  // 10. Animação do Subtítulo - (Era a Etapa 9)
  tl.to(
    ".intro-sub",
    {
      autoAlpha: 0.9,
      y: 0,
      duration: 0.7,
      ease: "power2.out",
    },
    "-=0.6"
  );

  // 11. Animação da Barra de Progresso e Linhas de Scan - (Era a Etapa 10)
  tl.to(".intro-progress", { autoAlpha: 1, duration: 0.3 }, "+=0.5");
  
  tl.to(
    ".intro-progress-bar",
    {
      width: "100%",
      duration: 2,
      ease: "power1.inOut",
    },
    "<"
  );

  tl.to(
    ".intro-lines .line",
    {
      scaleX: 1,
      stagger: 0.3,
      duration: 1.5,
      ease: "power2.out",
      repeat: 1,
      yoyo: true,
    },
    "<"
  );

  // 12. Pausa final - (Era a Etapa 11)
  tl.to({}, { duration: 0.5 });


  /**
   * Função de redirecionamento
   * (Chamada no 'onComplete' da timeline ou no 'click' do skip)
   */
  function redirectToHome() {
    // PRIMEIRO, mata as animações de rotação infinitas
    ringAnimations.forEach((anim) => anim.kill());

    // SEGUNDO, anima o fade-out e redireciona
    gsap.to("#intro-overlay", {
      autoAlpha: 0,
      duration: 0.6,
      ease: "power2.in",
      onComplete: () => {
        window.location.replace("index.html");
      },
    });
  }
}); // Fim do DOMContentLoaded