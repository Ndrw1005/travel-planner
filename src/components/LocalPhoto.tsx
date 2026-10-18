import { useEffect, useState } from "react";
import { type Place, safeUrl } from "../lib/model";
import { readPhoto } from "../lib/photos";
export default function LocalPhoto({ place }: { place: Place }) {
  const [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false,
      blobUrl = "";
    setUrl("");
    setFailed(false);
    if (place.photoKey)
      void readPhoto(place.photoKey)
        .then((blob) => {
          if (blob && !disposed) {
            blobUrl = URL.createObjectURL(blob);
            setUrl(blobUrl);
          }
        })
        .catch(() => {});
    return () => {
      disposed = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [place.photoKey]);
  const src = url || safeUrl(place.photoUrl || "");
  return src && !failed ? (
    <img
      className="place-detail-photo"
      src={src}
      alt={place.name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="place-photo-empty">No approved photo available</div>
  );
}
