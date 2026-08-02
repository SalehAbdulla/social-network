package render

import (
	"errors"
	"net/http"
	"text/template"
	"real-time-forum/pkg/config"
	"real-time-forum/pkg/models"
)

var app *config.AppConfig

func NewTemplates(a *config.AppConfig) {
	app = a
}

func RenderTemplate(w http.ResponseWriter, templateData *models.TemplateData) error {
	var templateCache map[string]*template.Template
	var err error
	if app.UseCache {
		templateCache = app.TemplateCache
	} else {
		templateCache, err = CreateTemplateCache()
		if err != nil {
			return err
		}
	}

	tmpl, inCache := templateCache["index.html"]
	if !inCache {
		return errors.New("error: template index.html is not found in cache")
	}

	if err := tmpl.Execute(w, templateData); err != nil {
		return err
	}

	return nil
}

func CreateTemplateCache() (map[string]*template.Template, error) {
	myCache := map[string]*template.Template{}

	templSet, err := template.New("index.html").ParseFiles("./templates/index.html")
	if err != nil {
		return myCache, err
	}

	myCache["index.html"] = templSet
	return myCache, nil
}