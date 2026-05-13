(function () {
  const header = document.querySelector("[data-header]");
  const canvas = document.getElementById("protocol-map");
  const copyButton = document.querySelector("[data-copy-code]");
  const quickstartCode = document.getElementById("quickstart-code");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (header) {
    const onScroll = () => {
      header.toggleAttribute("data-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const revealEls = Array.from(document.querySelectorAll(".reveal"));
  if (revealEls.length && "IntersectionObserver" in window && !prefersReducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -10%", threshold: 0.14 });

    revealEls.forEach((el, index) => {
      el.style.transitionDelay = `${Math.min(index % 5, 4) * 55}ms`;
      observer.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  if (copyButton && quickstartCode) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(quickstartCode.textContent.trim());
        const original = copyButton.textContent;
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = original;
        }, 1400);
      } catch (_) {
        copyButton.textContent = "Select text";
      }
    });
  }

  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let frame = 0;
  let start = performance.now();

  const nodes = [
    { id: "buyer", label: "buyer", x: 0.58, y: 0.19, color: "#66e0ad" },
    { id: "terms", label: "agreement", x: 0.76, y: 0.27, color: "#89bfff" },
    { id: "work", label: "work", x: 0.86, y: 0.46, color: "#d2a8ff" },
    { id: "verify", label: "verifier", x: 0.76, y: 0.65, color: "#ffcf74" },
    { id: "rail", label: "rail", x: 0.58, y: 0.74, color: "#66e0ad" },
    { id: "receipt", label: "receipt", x: 0.44, y: 0.55, color: "#ff8f87" }
  ];

  const edges = [
    ["buyer", "terms"],
    ["terms", "work"],
    ["work", "verify"],
    ["verify", "rail"],
    ["rail", "receipt"],
    ["receipt", "buyer"],
    ["terms", "rail"],
    ["verify", "receipt"]
  ];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(320, rect.width);
    height = Math.max(460, rect.height);
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    draw(performance.now());
  }

  function point(node) {
    return { x: node.x * width, y: node.y * height };
  }

  function byId(id) {
    return nodes.find((node) => node.id === id);
  }

  function cubic(a, b, c, d, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y
    };
  }

  function drawGrid(now) {
    const grid = Math.max(56, Math.min(width, height) / 9);
    context.save();
    context.globalAlpha = 0.62;
    context.lineWidth = 1;
    context.strokeStyle = "rgba(255,255,255,0.055)";
    const drift = prefersReducedMotion.matches ? 0 : ((now - start) / 80) % grid;

    for (let x = width * 0.36 - drift; x < width + grid; x += grid) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = -drift; y < height + grid; y += grid) {
      context.beginPath();
      context.moveTo(width * 0.30, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  }

  function drawEdge(source, target, progress) {
    const a = point(source);
    const d = point(target);
    const c1 = { x: a.x, y: (a.y + d.y) / 2 };
    const c2 = { x: d.x, y: (a.y + d.y) / 2 };

    context.beginPath();
    context.moveTo(a.x, a.y);
    context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, d.x, d.y);
    context.lineWidth = 1.2;
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.stroke();

    const pulse = cubic(a, c1, c2, d, progress);
    context.beginPath();
    context.arc(pulse.x, pulse.y, 4.2, 0, Math.PI * 2);
    context.fillStyle = target.color;
    context.shadowColor = target.color;
    context.shadowBlur = 16;
    context.fill();
    context.shadowBlur = 0;
  }

  function drawNode(node, now) {
    const p = point(node);
    const radius = Math.max(31, Math.min(width, height) * 0.046);
    const breathing = prefersReducedMotion.matches ? 0 : Math.sin((now - start) / 900 + p.x / 80) * 2.4;

    context.beginPath();
    context.arc(p.x, p.y, radius + breathing, 0, Math.PI * 2);
    context.fillStyle = "rgba(8, 11, 15, 0.84)";
    context.fill();
    context.lineWidth = 1.4;
    context.strokeStyle = node.color;
    context.stroke();

    context.beginPath();
    context.arc(p.x, p.y, 5.2, 0, Math.PI * 2);
    context.fillStyle = node.color;
    context.shadowColor = node.color;
    context.shadowBlur = 18;
    context.fill();
    context.shadowBlur = 0;

    context.fillStyle = "rgba(247,242,232,0.88)";
    context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(node.label, p.x, p.y + radius + 17);
  }

  function draw(now) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#080b0f";
    context.fillRect(0, 0, width, height);
    drawGrid(now);

    const elapsed = (now - start) / 1900;
    for (let i = 0; i < edges.length; i += 1) {
      const [from, to] = edges[i];
      const progress = prefersReducedMotion.matches ? 0.72 : (elapsed + i / edges.length) % 1;
      drawEdge(byId(from), byId(to), progress);
    }

    for (const node of nodes) {
      drawNode(node, now);
    }

    if (!prefersReducedMotion.matches) {
      frame = window.requestAnimationFrame(draw);
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  if (!prefersReducedMotion.matches) {
    frame = window.requestAnimationFrame(draw);
  }

  prefersReducedMotion.addEventListener("change", () => {
    window.cancelAnimationFrame(frame);
    start = performance.now();
    resize();
    if (!prefersReducedMotion.matches) {
      frame = window.requestAnimationFrame(draw);
    }
  });
})();
