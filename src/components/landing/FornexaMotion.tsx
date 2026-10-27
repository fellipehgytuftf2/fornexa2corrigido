import { useEffect, useState } from 'react';

/**
 * Animação Fornexa (catálogo → fornecedor → entrega), em loop.
 * Carrega /fornexa-motion.html no computador e /fornexa-motion-mobile.html no celular.
 * Os dois arquivos ficam na pasta public/.
 */
const MOBILE_QUERY = "(max-width: 767px)";

export default function FornexaMotion() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <section id="animacao" className="bg-navy-900 pt-4 pb-8" aria-label="Como a Fornexa funciona">
      <div className={isMobile ? "max-w-[400px] mx-auto px-4" : "max-w-6xl mx-auto px-6"}>
        <div
          className="relative w-full overflow-hidden rounded-[24px] border border-white/10 shadow-[0_30px_90px_-40px_rgba(30,120,160,0.5)]"
          style={{ aspectRatio: isMobile ? "400 / 720" : "1180 / 664" }}
        >
          <iframe
            key={isMobile ? "mobile" : "desktop"}
            src={isMobile ? "/fornexa-motion-mobile.html" : "/fornexa-motion.html"}
            title="Animação: como a Fornexa funciona"
            loading="lazy"
            scrolling="no"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full border-0 pointer-events-none"
          />
        </div>
      </div>
    </section>
  );
}
