import { useEffect, useRef } from 'react';
import './ZoomMonitor.css';

/** Tela do monitor na foto, em % da imagem (medida em galpao-fornexa). */
const SCREEN = { left: 39.94, top: 49.21, width: 20.84, height: 15.78 };

/** Logo dentro da tela, em frações da largura (x, w) e altura (y) da tela. */
const LOGO = { x: 0.2704, y: 0.186, w: 0.3811, aspect: 0.3 / 0.371875 };
/** Largura máxima em que a logo é desenhada (px). */
const LOGO_MAX = 2400;

/**
 * Zoom guiado pela rolagem: entra na tela do monitor do galpão e termina no
 * azul-petróleo liso de PLANOS (#06151E), de onde a seção de planos surge.
 */
export default function ZoomMonitor() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const sec = ref.current;
    if (!sec) return;
    sec.setAttribute('data-js', '');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const limpezas: Array<() => void> = [];
    const q = (s: string) => sec.querySelector(s) as HTMLElement;
    const sticky = q('.zm-sticky'), scene = q('.zm-scene'), zoom = q('.zm-zoom');
    const photo = q('.zm-photo'), tint = q('.zm-tint'), screen = q('.zm-screen');
    const finalC = q('.zm-screen-final'), logo = q('.zm-logo-live'), hint = q('.zm-hint');

    Object.assign(screen.style, {
      left: `${SCREEN.left}%`, top: `${SCREEN.top}%`, width: `${SCREEN.width}%`, height: `${SCREEN.height}%`,
    });
    zoom.style.transformOrigin = `${SCREEN.left + SCREEN.width / 2}% ${SCREEN.top + SCREEN.height / 2}%`;

    // Carrega a foto ~1 tela antes
    if ('IntersectionObserver' in window) {
      const pre = new IntersectionObserver((es) => {
        if (!es[0].isIntersecting) return;
        sec.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => { img.src = img.dataset.src!; img.removeAttribute('data-src'); });
        sec.querySelectorAll<HTMLSourceElement>('source[data-srcset]').forEach((s) => { s.srcset = s.dataset.srcset!; s.removeAttribute('data-srcset'); });
        pre.disconnect();
      }, { rootMargin: '100% 0px' });
      pre.observe(sec);
      limpezas.push(() => pre.disconnect());
    } else {
      sec.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => { img.src = img.dataset.src!; });
    }

    // Reveal de PLANOS: título e subtítulo, depois os 2 cartões
    const planos = document.getElementById('planos');
    if (planos && !reduce.matches && 'IntersectionObserver' in window) {
      const alvos = [
        planos.querySelector('h2'),
        planos.querySelector('h2 + p'),
        ...Array.from(planos.querySelectorAll('.grid > div')).slice(0, 2),
      ].filter(Boolean) as HTMLElement[];
      alvos.forEach((el, i) => { el.setAttribute('data-zm-reveal', ''); el.style.transitionDelay = `${i * 120}ms`; });
      const rv = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); rv.unobserve(e.target); } });
      }, { threshold: 0.15 });
      alvos.forEach((el) => rv.observe(el));
      limpezas.push(() => rv.disconnect());
    }

    if (reduce.matches) return () => limpezas.forEach((f) => f());

    const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
    const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    let geo = { s: 1, dx: 0, dy: 0, cx: 0, cy: 0, sw: 0, sh: 0, base: 1 };
    const measure = () => {
      const r = scene.getBoundingClientRect();
      const st = sticky.getBoundingClientRect();
      const vw = sticky.clientWidth, vh = sticky.clientHeight;
      const sw = (r.width * SCREEN.width) / 100, sh = (r.height * SCREEN.height) / 100;
      const cx = r.left - st.left + (r.width * (SCREEN.left + SCREEN.width / 2)) / 100;
      const cy = r.top - st.top + (r.height * (SCREEN.top + SCREEN.height / 2)) / 100;
      const s = Math.max(vw / sw, vh / sh) * 1.02;
      // maior escala em que a logo ainda aparece (p = 0.7)
      const sMax = Math.pow(s, easeInOut(0.78 / 0.92));
      const base = Math.min(LOGO.w * sw * sMax, LOGO_MAX);
      logo.style.width = `${base}px`;
      geo = { s, dx: vw / 2 - cx, dy: vh / 2 - cy, cx, cy, sw, sh, base };
    };
    const target = () => {
      const total = sec.offsetHeight - sticky.offsetHeight;
      return total > 0 ? clamp(-sec.getBoundingClientRect().top / total, 0, 1) : 0;
    };
    const apply = (p: number) => {
      const z = easeInOut(range(p, 0, 0.92));
      zoom.style.transform = `translate3d(${geo.dx * z}px,${geo.dy * z}px,0) scale(${Math.pow(geo.s, z)})`;
      hint.style.opacity = String(1 - range(p, 0, 0.12));
      screen.style.opacity = '1'; // tela nítida desde o início (cobre a logo borrada da foto)
      const S = Math.pow(geo.s, z);
      const lx = geo.cx + geo.dx * z + S * (LOGO.x - 0.5) * geo.sw;
      const ly = geo.cy + geo.dy * z + S * (LOGO.y - 0.5) * geo.sh;
      logo.style.transform = `translate3d(${lx}px,${ly}px,0) scale(${(S * LOGO.w * geo.sw) / geo.base})`;
      logo.style.opacity = String(1 - range(p, 0.5, 0.78));
      finalC.style.opacity = String(range(p, 0.35, 0.9));
      const out = range(p, 0.8, 0.9);
      photo.style.opacity = tint.style.opacity = String(1 - out);
    };

    let cur = target(), goal = cur, running = false;
    const loop = () => {
      cur += (goal - cur) * 0.12;
      if (Math.abs(goal - cur) < 0.0005) cur = goal;
      apply(cur);
      if (cur !== goal) requestAnimationFrame(loop);
      else { running = false; zoom.style.willChange = 'auto'; }
    };
    const onScroll = () => {
      goal = target();
      if (!running) { running = true; zoom.style.willChange = 'transform'; requestAnimationFrame(loop); }
    };
    const onResize = () => { measure(); apply(cur); onScroll(); };

    measure(); apply(cur);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    limpezas.push(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    });
    return () => limpezas.forEach((f) => f());
  }, []);

  return (
    <section ref={ref} className="zm" id="zoom-monitor" aria-label="Galpão FORNEXA">
      <div className="zm-sticky">
        <div className="zm-scene">
          <div className="zm-zoom">
            <div className="zm-photo">
              <picture>
                <source data-srcset="/galpao-fornexa.webp" type="image/webp" />
                <img
                  data-src="/galpao-fornexa.jpg"
                  alt="Galpão da FORNEXA com um monitor exibindo a logo"
                  decoding="async"
                  width={1550}
                  height={1014}
                />
              </picture>
              <noscript>
                <img src="/galpao-fornexa.jpg" alt="Galpão da FORNEXA com um monitor exibindo a logo" width={1550} height={1014} />
              </noscript>
            </div>
            <div className="zm-tint" />
            <div className="zm-screen" aria-hidden="true">
              <div className="zm-screen-base" />
              <div className="zm-screen-final" />
              <img className="zm-logo-static" src="/fornexa-logo-vetor.svg" alt="" decoding="async" />
            </div>
          </div>
        </div>
        <img className="zm-logo-live" src="/fornexa-logo-vetor.svg" alt="" aria-hidden="true" decoding="async" />
        <div className="zm-hint" aria-hidden="true">
          <span>Role para entrar</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#FFD300" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </div>
      </div>
    </section>
  );
}
