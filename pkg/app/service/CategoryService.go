package service

import (
	"real-time-forum/pkg/payload/category"
	db "real-time-forum/pkg/app/repositories"
)

type CategoryService interface {
	GetCategories() ([]category.CategoryDTO, error)
}

type CategoryServiceImpl struct {
	db db.CategoryRepository
}

func NewCategoryService(database db.CategoryRepository) CategoryService {
	return CategoryServiceImpl{
		db: database,
	}
}

func (c CategoryServiceImpl) GetCategories() ([]category.CategoryDTO, error) {
	categories, err := c.db.GetCategories()
	if err != nil {
		return nil, err
	}

	dtos := make([]category.CategoryDTO, len(categories))
	for i, cat := range categories {
		dtos[i] = category.CategoryDTO{
			CategoryId:   cat.CategoryId,
			CategoryName: cat.CategoryName,
		}
	}

	return dtos, nil
}
