const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const colors=value=>/^#[a-f0-9]{6}$/i.test(value)?value:'#f77716';
const shapes={shield:'M20 14L90 2L160 14L150 120L90 157L30 120Z',hexagon:'M90 3L159 42L159 120L90 157L21 120L21 42Z',medal:'M90 4A74 74 0 1 1 89.99 4Z'};
const symbols={star:'M90 34L99 60L126 68L100 78L90 104L80 78L54 68L81 60Z',bolt:'M98 32L62 77H88L80 108L118 62H92Z',book:'M47 48H71Q86 48 90 58Q95 48 109 48H132V94H109Q95 94 90 104Q85 94 71 94H47Z',trophy:'M69 42H111V73Q111 91 90 91Q69 91 69 73ZM69 48H55V63Q55 79 71 79M111 48H125V63Q125 79 109 79M90 91V107M75 109H105'};

export function badgeSvg(model){
  const color=colors(model.color),shape=shapes[model.shape]||shapes.shield,symbol=symbols[model.symbol]||symbols.star;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="185" viewBox="0 0 180 185" role="img" aria-label="'+xml(model.title)+'"><title>'+xml(model.title)+'</title><defs><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+color+'"/><stop offset="1" stop-color="#ffd8aa"/></linearGradient></defs><path d="'+shape+'" fill="#111113" stroke="url(#shine)" stroke-width="4"/><path d="'+symbol+'" fill="url(#shine)" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/><text x="90" y="133" text-anchor="middle" fill="#fff" font-size="18" font-weight="800" font-family="sans-serif">ST1</text><text x="90" y="179" text-anchor="middle" fill="#6b6b73" font-size="9" letter-spacing="2" font-family="sans-serif">ACADEMY</text></svg>';
}


export {colors,shapes,symbols};
