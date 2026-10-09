package web

import "social-network/backend/pkg/config"

// App is the process-wide configuration shared by the router, the security
// middleware and the request logger. main wires it up at boot; tests replace it
// with an isolated copy so they never touch the real upload directory.
var App config.AppConfig
