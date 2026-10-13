// Photo previews and canvas exports decode locally created object URLs.
// Keep Helmet defaults for every other directive; do not allow remote images.
module.exports = {
  contentSecurityPolicy: {
    directives: { imgSrc: ["'self'", 'data:', 'blob:'] },
  },
}
