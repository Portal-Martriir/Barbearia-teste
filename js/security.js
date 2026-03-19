(function enforceSecureOrigin() {
  const { protocol, hostname, host, pathname, search, hash } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isFileProtocol = protocol === 'file:';

  if (protocol === 'http:' && !isLocalHost && !isFileProtocol) {
    window.location.replace(`https://${host}${pathname}${search}${hash}`);
  }
})();
