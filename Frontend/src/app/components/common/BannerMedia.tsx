/** Renderiza el banner del perfil: video (mp4/webm) o imagen/GIF. */
export function BannerMedia({ src, className = "size-full object-cover" }: { src: string; className?: string }) {
  const isVideo = src.startsWith("data:video") || /\.(mp4|webm)$/i.test(src);
  if (isVideo) {
    return <video src={src} className={className} autoPlay loop muted playsInline />;
  }
  return <img src={src} alt="" className={className} />;
}
