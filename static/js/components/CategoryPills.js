

const defaultCategories = [
    { id: 'all', label: 'All' },
    { id: '1', label: 'Tech' },
    { id: '2', label: 'General' },
    { id: '3', label: 'Dev' },
    { id: '4', label: 'Gaming' },
    { id: '5', label: 'Q&A' },
    { id: '6', label: 'Random' },
    { id: '7', label: 'Life' },
    { id: '8', label: 'Sport' },
];

export function createCategoryPills(activeId = 'all', onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'categories-wrapper';
    
    const scroll = document.createElement('div');
    scroll.className = 'categories-scroll';
    
    defaultCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-pill${activeId === cat.id ? ' active' : ''}`;
        btn.dataset.category = cat.id;
        btn.textContent = cat.label;
        
        btn.addEventListener('click', () => {
            scroll.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            if (onChange) onChange(cat.id);
        });
        
        scroll.appendChild(btn);
    });
    
    wrapper.appendChild(scroll);
    return wrapper;
}