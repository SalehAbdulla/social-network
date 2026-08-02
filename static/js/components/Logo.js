
export function createLogo(size = 'default') {
    const fontSize = size === 'large' ? '26px' : '24px';
    const dotSize = size === 'large' ? '6px' : '5px';
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = `
        <span style="font-size:${fontSize}">forum</span>
        <span class="logo-dot" style="width:${dotSize};height:${dotSize}"></span>
    `;
    return logo;
}