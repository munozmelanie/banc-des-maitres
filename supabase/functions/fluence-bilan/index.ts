/** Envoi privé d'un bilan : le secret parent autorise l'écriture, jamais la lecture. */
type Objet = Record<string, unknown>;
type Config = {
  url: string;
  serviceKey: string;
  allowedOrigins: string[];
  fetcher?: typeof fetch;
  now?: () => number;
};
const MAX_BYTES = 32768;
const TOKENS = /^[0-9a-f]{64}$/;
const objet = (v: unknown): v is Objet => v !== null && typeof v === "object" && !Array.isArray(v);
function cles(v: unknown, attendues: string[]): v is Objet {
  return objet(v) && Object.keys(v).length === attendues.length && attendues.every(k => Object.hasOwn(v, k));
}
const entier = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function chaine(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && Array.from(v).length <= max && !/[<>\u0000-\u001f\u007f-\u009f]/.test(v) && !/[\uD800-\uDFFF]/u.test(v);
}

/** Liste fermée : aucune donnée owner, élève de classe, secret ou champ inconnu. */
export function validePaquet(value: unknown, now = Date.now()): Objet | null {
  if (!cles(value, ["format", "version", "texte", "bilan"]) || value.format !== "fluence/bilan-maison" || value.version !== 1 || typeof value.texte !== "string" || !/^[0-9a-f]{8}$/.test(value.texte)) return null;
  const b = value.bilan;
  if (!cles(b, ["id", "origine", "prenom", "ep", "titre", "date", "secondes", "dernier", "fautes", "lus", "erreurs", "mclm"])) return null;
  if (typeof b.id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(b.id) || b.origine !== "maison" || !chaine(b.prenom, 80) || !chaine(b.titre, 200) || typeof b.ep !== "string" || !/^[ET][1-9][0-9]{0,2}$/.test(b.ep)) return null;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(b.date)) return null;
  const date = Date.parse(b.date);
  if (!Number.isFinite(date) || date < Date.UTC(2000, 0, 1) || date > now + 86400000) return null;
  // La normalisation ne doit pas transformer silencieusement un 31 février.
  if (new Date(date).toISOString().slice(0, 19) !== b.date.slice(0, 19)) return null;
  if (typeof b.secondes !== "number" || !Number.isFinite(b.secondes) || b.secondes < 1 || b.secondes > 60 || !entier(b.dernier, 0, 5000) || !entier(b.lus, 1, 1000) || b.lus > b.dernier + 1 || !entier(b.erreurs, 0, b.lus) || !Array.isArray(b.fautes) || b.fautes.length > 1000 || b.fautes.length !== b.erreurs || new Set(b.fautes).size !== b.fautes.length || b.fautes.some(f => !entier(f, 0, b.dernier as number))) return null;
  const score = Math.round((b.lus - b.erreurs) * 60 / b.secondes);
  if (!entier(b.mclm, 0, 60000) || b.mclm !== score) return null;
  // Conserver la représentation du paquet pour l'idempotence ; la classe
  // vérifie aussi l'empreinte et les indices contre son propre texte.
  return {
    format: "fluence/bilan-maison", version: 1, texte: value.texte,
    bilan: { id: b.id, origine: "maison", prenom: b.prenom, ep: b.ep, titre: b.titre, date: b.date,
      secondes: b.secondes, dernier: b.dernier, fautes: b.fautes.slice(), lus: b.lus, erreurs: b.erreurs, mclm: score }
  };
}

async function litCorps(request: Request): Promise<unknown> {
  const tailleAnnoncee = request.headers.get("content-length");
  if (tailleAnnoncee && (!/^\d+$/.test(tailleAnnoncee) || Number(tailleAnnoncee) > MAX_BYTES)) throw new Error("too_large");
  if (!request.body) throw new Error("invalid_json");
  const lecteur = request.body.getReader();
  const morceaux: Uint8Array[] = []; let taille = 0;
  try {
    while (true) {
      const { value, done } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > MAX_BYTES) { await lecteur.cancel(); throw new Error("too_large"); }
      morceaux.push(value);
    }
  } finally { lecteur.releaseLock(); }
  const bytes = new Uint8Array(taille); let offset = 0;
  for (const morceau of morceaux) { bytes.set(morceau, offset); offset += morceau.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("invalid_json"); }
}

export function createHandler(config: Config): (request: Request) => Promise<Response> {
  const transport = config.fetcher ?? fetch;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const originPermise = !origin || config.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", "Vary": "Origin"
    };
    if (origin && originPermise) headers["Access-Control-Allow-Origin"] = origin;
    const reponse = (status: number, value: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
    if (!originPermise) return reponse(403, { error: "origin_not_allowed" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info", "Access-Control-Max-Age": "600"
    } });
    if (request.method !== "POST") return reponse(405, { error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return reponse(415, { error: "json_required" });
    let body: unknown;
    try { body = await litCorps(request); }
    catch (e) { return reponse(e instanceof Error && e.message === "too_large" ? 413 : 400, { error: e instanceof Error && e.message === "too_large" ? "too_large" : "invalid_json" }); }
    if (!cles(body, ["token", "paquet"])) return reponse(400, { error: "invalid_request" });
    if (typeof body.token !== "string" || !TOKENS.test(body.token)) return reponse(401, { error: "invalid_access" });
    const paquet = validePaquet(body.paquet, config.now?.() ?? Date.now());
    if (!paquet) return reponse(400, { error: "invalid_payload" });
    if (!config.url || !config.serviceKey) return reponse(503, { error: "service_unavailable" });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token));
    const hash = Array.from(new Uint8Array(digest), octet => octet.toString(16).padStart(2, "0")).join("");
    try {
      const response = await transport(config.url.replace(/\/$/, "") + "/rest/v1/rpc/fluence_receive_result", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "apikey": config.serviceKey, "Authorization": "Bearer " + config.serviceKey },
        body: JSON.stringify({ p_token_hash: hash, p_payload: paquet })
      });
      const data = await response.json();
      if (!response.ok) {
        const erreurs: Record<string, [number, string]> = {
          PT400: [400, "invalid_payload"], PT401: [401, "invalid_access"],
          PT409: [409, "idempotency_conflict"], PT429: [429, "rate_limited"]
        };
        const erreur = erreurs[objet(data) && typeof data.code === "string" ? data.code : ""];
        if (erreur) return reponse(erreur[0], { error: erreur[1] }, erreur[0] === 429 ? { "Retry-After": "86400" } : {});
        return reponse(503, { error: "service_unavailable" });
      }
      const recu = Array.isArray(data) && data.length === 1 ? data[0] : null;
      if (!objet(recu) || typeof recu.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recu.id) || typeof recu.received_at !== "string" || !Number.isFinite(Date.parse(recu.received_at))) return reponse(503, { error: "service_unavailable" });
      // Ne jamais renvoyer le payload, le prénom, l'accès, owner ou child_ref.
      return reponse(200, { id: recu.id, received_at: recu.received_at });
    } catch { return reponse(503, { error: "service_unavailable" }); }
  };
}

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
if (typeof Deno !== "undefined") {
  Deno.serve(createHandler({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    allowedOrigins: (Deno.env.get("FLUENCE_ALLOWED_ORIGINS") ?? "https://munozmelanie.github.io").split(",").map(s => s.trim()).filter(Boolean)
  }));
}
