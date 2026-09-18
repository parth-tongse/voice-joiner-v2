// @ts-ignore
import * as spotifyUrlInfoPkg from "spotify-url-info";

// @ts-ignore
const spotifyUrlInfo: any =
  (spotifyUrlInfoPkg as any)?.default || spotifyUrlInfoPkg;
const { getData, getTracks, getPreview } =
  typeof spotifyUrlInfo === "function"
    ? spotifyUrlInfo(fetch)
    : { getData: undefined, getTracks: undefined, getPreview: undefined };

export interface SpotifyTrackInfo {
  id: string;
  title: string;
  author: string;
  url: string;
  durationMs: number;
  artworkUrl?: string;
  source: "spotify";
}

export interface SpotifyCollectionInfo {
  type: "playlist" | "album";
  title: string;
  artworkUrl?: string;
  tracks: SpotifyTrackInfo[];
}

export interface SpotifySingleTrackInfo {
  type: "track";
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs: number;
}

export type SpotifyEntityResult =
  | SpotifySingleTrackInfo
  | SpotifyCollectionInfo;

// Check if string is a Spotify URL or URI
export function isSpotifyUrl(query: string): boolean {
  if (!query) return false;
  const q = query.trim();
  return (
    q.includes("spotify.com/track/") ||
    q.includes("spotify.com/playlist/") ||
    q.includes("spotify.com/album/") ||
    q.startsWith("spotify:track:") ||
    q.startsWith("spotify:playlist:") ||
    q.startsWith("spotify:album:")
  );
}

export function isSpotifyPlaylistOrAlbum(query: string): boolean {
  if (!query) return false;
  const q = query.trim();
  return (
    q.includes("spotify.com/playlist/") ||
    q.includes("spotify.com/album/") ||
    q.startsWith("spotify:playlist:") ||
    q.startsWith("spotify:album:")
  );
}

// Clean Spotify URL (strip tracking query parameters if needed)
export function sanitizeSpotifyUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.trim();
  }
}

// Extract Spotify entity ID and type
export function parseSpotifyEntity(url: string): { type: "track" | "playlist" | "album"; id: string } | null {
  const clean = url.trim();
  const trackMatch = clean.match(/track[/:]([a-zA-Z0-9_-]+)/);
  if (trackMatch) return { type: "track", id: trackMatch[1] };

  const plMatch = clean.match(/playlist[/:]([a-zA-Z0-9_-]+)/);
  if (plMatch) return { type: "playlist", id: plMatch[1] };

  const albumMatch = clean.match(/album[/:]([a-zA-Z0-9_-]+)/);
  if (albumMatch) return { type: "album", id: albumMatch[1] };

  return null;
}

// Fast & Reliable: Parse Spotify embed page directly for __NEXT_DATA__
async function fetchEmbedNextData(embedUrl: string): Promise<any | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      return parsed.props?.pageProps?.state?.data?.entity || null;
    }
  } catch (err: any) {
    console.warn("[SpotifyResolver] fetchEmbedNextData error:", err.message);
  }
  return null;
}

// Fallback: oEmbed for basic track / playlist name
async function fetchOEmbed(url: string): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url.trim())}`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    let title = data.title || "Spotify Music";
    let artist = "Spotify Artist";
    if (title.includes(" by ")) {
      const parts = title.split(" by ");
      title = parts[0];
      artist = parts[1];
    }
    return {
      title,
      artist,
      artworkUrl: data.thumbnail_url || undefined,
    };
  } catch {}
  return null;
}

/**
 * Main Spotify Resolver: Resolves track, playlist, or album with multiple fallback tiers.
 */
export async function resolveSpotify(url: string): Promise<SpotifyEntityResult | null> {
  const cleanUrl = url.trim();
  const parsed = parseSpotifyEntity(cleanUrl);
  const isCollection = parsed ? parsed.type === "playlist" || parsed.type === "album" : isSpotifyPlaylistOrAlbum(cleanUrl);

  // === CASE 1: PLAYLIST OR ALBUM ===
  if (isCollection) {
    // 1. Primary: Parse embed page __NEXT_DATA__ (High accuracy, official Spotify CDN)
    if (parsed) {
      const embedUrl = `https://open.spotify.com/embed/${parsed.type}/${parsed.id}`;
      const entity = await fetchEmbedNextData(embedUrl);
      if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
        const title = entity.name || entity.title || (parsed.type === "album" ? "Spotify Album" : "Spotify Playlist");
        const artworkUrl =
          entity.coverArt?.sources?.[0]?.url ||
          entity.visualIdentity?.image?.[2]?.url ||
          entity.visualIdentity?.image?.[0]?.url;

        const tracks: SpotifyTrackInfo[] = entity.trackList.map((t: any, idx: number) => {
          const trackTitle = (t.title || t.name || "Track").trim();
          const trackAuthor = (t.subtitle || t.artist || "Spotify Artist").trim();
          const uri = t.uri || "";
          return {
            id: uri || `spotify-${idx}`,
            title: trackTitle,
            author: trackAuthor,
            url: uri ? `https://open.spotify.com/track/${uri.replace("spotify:track:", "")}` : cleanUrl,
            durationMs: t.duration || 180000,
            artworkUrl,
            source: "spotify" as const,
          };
        });

        return {
          type: parsed.type === "album" ? "album" : "playlist",
          title,
          artworkUrl,
          tracks,
        };
      }
    }

    // 2. Secondary: spotify-url-info
    try {
      const [data, rawTracks] = await Promise.all([
        getData(cleanUrl).catch(() => null),
        getTracks(cleanUrl).catch(() => []),
      ]);

      if (rawTracks && rawTracks.length > 0) {
        const title =
          data?.name ||
          data?.title ||
          (parsed?.type === "album" ? "Spotify Album" : "Spotify Playlist");
        const artworkUrl =
          data?.coverArt?.sources?.[0]?.url ||
          data?.images?.[0]?.url ||
          data?.visualIdentity?.image?.[0]?.url;

        const tracks: SpotifyTrackInfo[] = rawTracks.map((t: any, idx: number) => ({
          id: t.uri || `spotify-${idx}`,
          title: (t.name || t.title || "Track").trim(),
          author: (t.artist || "Spotify Artist").trim(),
          url: t.uri ? `https://open.spotify.com/track/${t.uri.replace("spotify:track:", "")}` : cleanUrl,
          durationMs: t.duration || 180000,
          artworkUrl,
          source: "spotify" as const,
        }));

        return {
          type: parsed?.type === "album" ? "album" : "playlist",
          title,
          artworkUrl,
          tracks,
        };
      }
    } catch (err: any) {
      console.warn("[SpotifyResolver] spotify-url-info collection notice:", err.message);
    }

    // 3. Fallback: oEmbed (at least gives playlist title)
    const oembed = await fetchOEmbed(cleanUrl);
    if (oembed) {
      return {
        type: parsed?.type === "album" ? "album" : "playlist",
        title: oembed.title,
        artworkUrl: oembed.artworkUrl,
        tracks: [
          {
            id: cleanUrl,
            title: oembed.title,
            author: oembed.artist,
            url: cleanUrl,
            durationMs: 200000,
            artworkUrl: oembed.artworkUrl,
            source: "spotify" as const,
          },
        ],
      };
    }
  }

  // === CASE 2: SINGLE TRACK ===
  // 1. Primary: Parse embed page __NEXT_DATA__
  if (parsed && parsed.type === "track") {
    const embedUrl = `https://open.spotify.com/embed/track/${parsed.id}`;
    const entity = await fetchEmbedNextData(embedUrl);
    if (entity) {
      const artist =
        entity.artists?.map((a: any) => a.name).join(", ") ||
        entity.subtitle ||
        "Spotify Artist";
      const artworkUrl =
        entity.coverArt?.sources?.[0]?.url ||
        entity.visualIdentity?.image?.[2]?.url ||
        entity.visualIdentity?.image?.[0]?.url;

      return {
        type: "track",
        title: (entity.name || entity.title || "Track").trim(),
        artist,
        artworkUrl,
        durationMs: entity.duration || 180000,
      };
    }
  }

  // 2. Secondary: spotify-url-info getPreview
  try {
    const preview = await getPreview(cleanUrl);
    if (preview && (preview.title || preview.track)) {
      return {
        type: "track",
        title: (preview.title || preview.track).trim(),
        artist: (preview.artist || "Spotify Artist").trim(),
        artworkUrl: preview.image,
        durationMs: 200000,
      };
    }
  } catch (err: any) {
    console.warn("[SpotifyResolver] spotify-url-info preview notice:", err.message);
  }

  // 3. Fallback: oEmbed
  const oembed = await fetchOEmbed(cleanUrl);
  if (oembed) {
    return {
      type: "track",
      title: oembed.title,
      artist: oembed.artist,
      artworkUrl: oembed.artworkUrl,
      durationMs: 200000,
    };
  }

  return null;
}
