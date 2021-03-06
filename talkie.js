
/**
 * Module dependencies
 */

var routes = require('./routes'),
  routesAuth = require('./routes/auth'),
  routesApi = require('./routes/api'),
  routesChat = require('./routes/chat'),
  http = require('http'),
  path = require('path'),
  longjohn = require('longjohn');

var config = require('./config')
  , express = config.express
  , app = config.app
  , server = config.server
  , io = config.io
  , statistics = require('./statistics')
  , passport = require('./passport').passport
  , db = require('./db')
  , Banned = db.Banned;

/**
 * Configuration
 */

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
if (app.get('env') === 'development') {
  app.use(require('less-middleware')({ src : __dirname + '/public', enable: ['less']}));
}
app.use(determineEnv());
app.use(express.cookieParser(config.secretKey));
app.use(express.session({
  store: config.redisStore,
  secret: config.secretKey,
  prefix: config.sessionPrefix,
  cookie: { expires: true, maxAge: config.sessionExpiration },
}));
app.use(passport.initialize());
app.use(passport.session());
//app.use(isBanned());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use('/static', express.static(path.join(__dirname, 'public')));
// app.use(statistics());
var appPages = ['/chat', '/api/user-data'];
app.use(authenticate(appPages));
//app.use(express.favicon(path.join(__dirname, 'public/img/fav.gif')));
app.use(app.router);

// development only
if (app.get('env') === 'development') {
  app.use(express.errorHandler());
}

// production only
if (app.get('env') === 'production') {
  // TODO
}


/**
 * Routes
 */

// serve index and view partials
app.get('/', routes.index);
//app.post('/auth', routesAuth.auth);
app.post('/login', passport.authenticate('local', { successRedirect: '/chat',
                                                    failureRedirect: '/'}));
app.get('/exit', routesAuth.exit);
app.get('/chat', routesChat.chat);
app.get('/partials/:name', routes.partials);
app.get('/rules', routes.rules);
app.get('/about', routes.about);
app.post('/signup', routesAuth.signup);
app.get('/verification', routesAuth.verification);
app.get('/verify/:key', routesAuth.verify);
app.get('/emailtest', routes.emailTest);

// JSON API
app.get('/api/version', routesApi.version);
app.get('/api/user-data', routesApi.userData);

// redirect all others to the index (HTML5 history)
app.get('*', routes.index);

// Socket.io Communication
io.sockets.on('connection', require('./routes/socket'));

/**
 * Start Server
 */

server.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});

function isBanned() {
  return function (req, res, next) {
    if (req.path.indexOf('/static') == 0) {
      next();
    }
    var ip;
    if (req.headers['x-nginx-proxy']) {
      ip = req.headers['x-real-ip'];
    } else {
      ip = req.connection.remoteAddress;
    }
    Banned.findOne({ip: ip}, function (err, banned) {
      if (err || !banned) {
        next();
      } else {
        if (banned.expires <= new Date(Date.now())) {
          banned.remove(function (err) {
            if (err) {
              console.error('[Middleware] Could not remove banned from db.');
            }
          });
          next();
        } else {
          var remaining = new Date(banned.expires - new Date(Date.now()));
          remaining = remaining.getTime();

          var days = Math.floor(remaining / 1000 / 60 / 60 / 24);
          remaining -= days * 1000 * 60 * 60 * 24;

          var hours = Math.floor(remaining / 1000 / 60 / 60);
          remaining -= hours * 1000 * 60 * 60;

          var minutes = Math.floor(remaining / 1000 / 60);
          remaining -= minutes * 1000 * 60;

          var seconds = Math.floor(remaining / 1000);

          var output = '';
          if (days) output = days + 'روز ';
          if (hours) output = output + hours + 'ساعت ';
          if (minutes) output = output + minutes + 'دقیقه ';
          if (seconds) output = output + seconds + 'ثانیه';

          res.render('banned', {expireDate: output});
        }
      }
    });
  };
}

function authenticate(appPages) {
  return function (req, res, next) {
    if (req.path.indexOf('/static') === 0 ) {
      return;
    }
    if (appPages.indexOf(req.path) == -1) {
      next();
    } else {
      if (typeof req.user === 'undefined' ||
          !req.user) {
        res.redirect('/');
      } else if (req.user.isBanned()) {
        var remaining = new Date(req.user.banExpiration - new Date(Date.now()));
        remaining = remaining.getTime();

        var days = Math.floor(remaining / 1000 / 60 / 60 / 24);
        remaining -= days * 1000 * 60 * 60 * 24;

        var hours = Math.floor(remaining / 1000 / 60 / 60);
        remaining -= hours * 1000 * 60 * 60;

        var minutes = Math.floor(remaining / 1000 / 60);
        remaining -= minutes * 1000 * 60;

        var seconds = Math.floor(remaining / 1000);

        var output = '';
        if (days) output = days + 'روز ';
        if (hours) output = output + hours + 'ساعت ';
        if (minutes) output = output + minutes + 'دقیقه ';
        if (seconds) output = output + seconds + 'ثانیه';

        res.render('banned', {expireDate: output});
      } else {
        next();
      }
    }
  };
}

function determineEnv() {
  return function (req, res, next) {
    req.development = false;
    if (app.get('env') === 'development') {
      req.development = true;
    }
    next();
  };
}
