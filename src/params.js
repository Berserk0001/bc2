const DEFAULT_QUALITY = 10;

function params(req, res, next) {
  const { url, jpeg, bw, l } = req.query;

  if (!url) {
    return res.end('bandwidth-hero-proxy');
  }

  const urls = Array.isArray(url) ? url.join('&url=') : url;
  const cleanedUrl = urls.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, 'http://');

  req.params.url = cleanedUrl;
  req.params.webp = !jpeg;
  req.params.grayscale = bw !== '0';
  req.params.quality = parseInt(l, 10) || DEFAULT_QUALITY;

  next();
}

module.exports = params;
