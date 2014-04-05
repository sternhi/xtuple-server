(function () {
  'use strict';

  /**
   * Setup SSL in nginx
   */
  var ssl = exports;

  var task = require('../../lib/task'),
    format = require('string-format'),
    _ = require('underscore'),
    exec = require('execSync').exec,
    fs = require('fs'),
    Zip = require('adm-zip'),
    path = require('path');

  _.extend(ssl, task, /** @exports ssl */ {

    outpath: path.resolve('/etc/ssl/private'),
    
    options: {
      'inzip': {
        optional: '[file]',
        description: 'Path to SSL trust chain archive',
        value: null
      },
      'incrt': {
        optional: '[file]',
        description: 'Path to SSL certificate (.crt)',
        value: null
      },
      'inkey': {
        optional: '[file]',
        description: 'Path to SSL private key (.key)',
        value: null
      }
    },

    /** @override */
    beforeTask: function (options) {
      var nginx = options.nginx;

      nginx.outcrt = path.resolve(ssl.getBasename(options) + '.crt');
      nginx.outkey = path.resolve(ssl.getBasename(options) + '.key');

      // correctly permission outpath. should be owned by ssl-cert group if not already
      exec('mkdir -p '+ ssl.outpath);
      exec('chown -R :ssl-cert '+ ssl.outpath);
      exec('chmod -R o-rwx,g=rx,u=rwx /etc/ssl/private/');

      if (_.isString(nginx.inzip) && fs.existsSync(nginx.inzip)) {
        nginx.inzip = path.resolve(nginx.inzip);
        ssl.createBundle(options);
      }
      else if (/localhost/.test(nginx.domain)) {
        if (_.isString(nginx.incrt) && _.isString(nginx.inkey)) {
          nginx.incrt = path.resolve(nginx.incrt);
          nginx.inkey = path.resolve(nginx.inkey);
        }
        else {
          throw new Error('nginx.incrt and nginx.inkey are required for non-localhost domains');
        }

        ssl.generate(options);
      }
    },

    /** @override */
    run: function (options) {
      exec('cp {nginx.incrt} {nginx.outcrt}'.format(options));
      exec('cp {nginx.inkey} {nginx.outkey}'.format(options));
    },

    /**
     * Return basename of SSL cert. This in itself will *not* be a valid path
     * since it doesn't include the file extension.
     *
     * "basename" = <http://nodejs.org/api/path.html#path_path_basename_p_ext>
     * @public
     */
    getBasename: function (options) {
      return path.resolve(ssl.outpath, options.nginx.domain);
    },

    /**
     * Generate and write a self-signed SSL keypair.
     * @static
     */
    generate: function (options) {
      return exec([
        'openssl req',
        '-x509 -newkey rsa:2048',
        '-subj \'/C=US/CN='+ options.nginx.domain + '/O=xTuple\'',
        '-days 365',
        '-nodes',
        '-keyout', path.resolve(options.nginx.inkey),
        '-out', path.resolve(options.nginx.incrt)
      ].join(' ')).stdout;
    },

    /**
     * Create a .crt bundle from a Comodo zip archive
     */
    createBundle: function (options) {
      var inzip = new Zip(options.nginx.inzip),
        entries = inzip.getEntries(),
        sort = function (entry) {
          return {
            'PositiveSSLCA2.crt': 1,
            'AddTrustExternalCARoot.crt': 2
          }[entry.entryName] || 0;
        },

        // cat mydomain.crt PositiveSSLCA2.crt AddTrustExternalCARoot.crt >> sslbundle.crt
        bundleStr = _.reduce(_.sortBy(entries, sort), function (memo, entry) {
          return memo + inzip.readAsText(entry);
        }, '');

      // TODO switch to camelcase. I don't know what it is about writing sysadmin
      // scripts that makes me want to use underscores everywhere
      fs.writeFileSync(options.nginx.incrt, bundleStr);
      return true;
    },

    /**
     * Perform two-factor verification of the provided SSL files:
     * 1. verify the x509-ness of the incrt
     * 2. check crt/key modulus equality
     *
     * @param options.nginx.inkey
     * @param options.nginx.incrt
     * @return true if both of these conditions hold
     */
    verifyCertificate: function (options) {
      var inkey = path.resolve(options.nginx.inkey),
        incrt = path.resolve(options.nginx.incrt);

      if (!fs.existsSync(incrt)) {
        throw new Error('Provided .crt file does not exist: '+ incrt);
      }
      if (!fs.existsSync(inkey)) {
        throw new Error('Provided .key file does not exist: '+ inkey);
      }

      // verify x509 certificate
      if (exec('openssl x509 -noout -in ' + incrt).code !== 0) {
        throw new Error('The provided .crt failed openssl x509 verify');
      }

      var key_modulus = exec('openssl rsa -noout -modulus -in '+ inkey).stdout,
        crt_modulus = exec('openssl x509 -noout -modulus -in '+ incrt).stdout;

      // perform modulus check
      if (key_modulus !==/*======*/ crt_modulus) {  // much equal. very modulus.
        throw new Error(
          'crt/key moduli inconsistent; ' +
          'basically, the .crt was not created from the .key'
        );
      }

      return true;
    }
  });
})();