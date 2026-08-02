package repositories

import (
	realtimeforum "real-time-forum"
	"real-time-forum/pkg/models"
)

type CategoryRepository interface {
	GetCategories() ([]models.Category, error)
}

func (db *DB) GetCategories() ([]models.Category, error) {
	rows, err := db.Conn.Query("SELECT categoryId, categoryName FROM category")
	if err != nil {
		return nil, realtimeforum.ErrInternal
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var cat models.Category
		if err := rows.Scan(&cat.CategoryId, &cat.CategoryName); err != nil {
			return nil, realtimeforum.ErrInternal
		}
		categories = append(categories, cat)
	}

	if err := rows.Err(); err != nil {
		return nil, realtimeforum.ErrInternal
	}

	if categories == nil {
		return []models.Category{}, nil
	}

	return categories, nil
}