import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FaceImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Pode ser um path (`face-images/uid/xxx.jpg`) ou a URL completa (pública antiga). */
  src: string | null | undefined;
}

// Extrai o path dentro do bucket `avatars`, aceitando URLs públicas antigas.
const toPath = (input: string): string => {
  if (!input) return "";
  const marker = "/object/public/avatars/";
  const signMarker = "/object/sign/avatars/";
  const p = input.includes(marker)
    ? input.split(marker)[1]
    : input.includes(signMarker)
    ? input.split(signMarker)[1].split("?")[0]
    : input;
  return decodeURIComponent(p);
};

/**
 * Renderiza uma imagem armazenada no bucket privado `avatars` gerando uma
 * URL assinada de curta duração no momento da exibição.
 * Compatível com valores legados que ainda são URLs públicas completas.
 */
const FaceImage = ({ src, alt = "", ...rest }: FaceImageProps) => {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!src) {
      setSigned(null);
      return;
    }
    const path = toPath(src);
    if (!path) {
      setSigned(null);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 10) // 10 minutos
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          setSigned(null);
          return;
        }
        setSigned(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [src]);

  if (!signed) {
    return <div {...(rest as any)} aria-label={alt} />;
  }
  return <img src={signed} alt={alt} {...rest} />;
};

export default FaceImage;
