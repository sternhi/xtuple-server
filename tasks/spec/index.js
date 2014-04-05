global.options = { };

describe('xTuple Installer', function () {
  var assert = require('chai').assert,
    exec = require('execSync').exec,
    _ = require('underscore'),
    path = require('path'),
    pgcli = require('../../lib/pg-cli'),
    pgPhase = require('../pg'),
    getOptions = function ($k) {
      return {
        xt: {
          version: '4.4.0',
          edition: 'core',
          name: $k,
          setupdemos: true,
          srcdir: path.resolve('/tmp/xtmocha/src', '4.4.0'),
          adminpw: '123'
        },
        nginx: {
          domain: 'localhost',
          // mock; generated by nginx.ssl#beforeTask
          incrt: '/tmp/mocha-'+ $k +'.crt',
          inkey: '/tmp/mocha-'+ $k +'.key'
        },
        pg: {
          version: process.env.XT_PG_VERSION || '9.1',
          host: 'localhost',
          mode: 'test',
          snapshotcount: 7,
          config: {
            slots: 1,
            shared_buffers: 128,
            temp_buffers: 8,
            max_connections: 8,
            work_mem: 1,
            maintenance_work_mem: 8,
            locale: 'en_US.UTF-8'
          }
        }
      };
    };

  beforeEach(function () {
    _.extend(global.options, getOptions(Math.round((Math.random() * 2e16)).toString(16)));
  });


  /**
   * Require root prvileges
   */
  it('should be run with root privileges', function () {
    assert(
      exec('id -u').stdout.indexOf('0') === 0,
      'installer tests must be run with sudo'
    );
  });
  it('should be run with XT_PG_VERSION environment variable set', function () {
    assert.include([ '9.1', '9.3' ], process.env.XT_PG_VERSION);
  });

  require('./sys');
  require('./pg');
  require('./nginx');
  require('./xt');
});