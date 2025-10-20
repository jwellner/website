var fs = require('fs');
var path  = require('path');

module.exports = function(assets) {
  assets = assets || [{}];
  assets = !Array.isArray(assets) ? [ assets ] : assets;

  return function(files, metalsmith, done) {
    assets.forEach(function(opts) {
      var relSrc = opts.src || 'public';
      var relDest = opts.dest || 'public';

      var src = path.join(metalsmith.directory(), relSrc);
      var dst = path.join(metalsmith.destination(), relDest);

      fs.cpSync(src, dst, {recursive: true})
    });

    done();
  };
};