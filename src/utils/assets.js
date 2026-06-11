export function assetUrl(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${cleanPath}`;
}
