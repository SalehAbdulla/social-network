package config

import "os"

var PORT_NUMBER string

func init() {
	PORT_NUMBER = getPort()
}

func getPort() string {
	if port := os.Getenv("PORT"); port != "" {
		return ":" + port
	}
	return ":5174"
}
