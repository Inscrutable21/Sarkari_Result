const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');
const { Agent: HttpAgent } = require('node:http');
const { Agent: HttpsAgent } = require('node:https');

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

// Validate the actual DNS results used by the socket, rather than doing a
// separate preflight resolution that could be changed through DNS rebinding.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
      return callback(new Error('Non-public destination blocked'));
    }
    const family = typeof options === 'number' ? options : options?.family;
    const selected = family ? addresses.filter(entry => entry.family === family) : addresses;
    if (!selected.length) return callback(new Error('No public destination available'));
    if (options?.all) return callback(null, selected);
    callback(null, selected[0].address, selected[0].family);
  });
}

const safeFetchOptions = {
  maxRedirects: 0,
  maxContentLength: 2 * 1024 * 1024,
  proxy: false,
  httpAgent: new HttpAgent({ lookup: publicLookup }),
  httpsAgent: new HttpsAgent({ lookup: publicLookup })
};

module.exports = { isPublicAddress, publicLookup, safeFetchOptions };
