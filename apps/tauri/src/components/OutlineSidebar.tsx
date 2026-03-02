import { useState, useEffect } from 'react';
import { Hash, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Heading } from '@/types';

interface OutlineSidebarProps {
  headings: Heading[];
  onClose?: () => void;
}

function headingId(heading: Heading): string {
  return `mkw-heading-${heading.index}`;
}

export function OutlineSidebar({ headings, onClose }: OutlineSidebarProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -80% 0px' }
    );

    headings.forEach((h) => {
      const element = document.getElementById(headingId(h));
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  const handleClick = (heading: Heading) => {
    const id = headingId(heading);
    setActiveId(id);

    const element = document.getElementById(id);
    if (element) {
      const container = element.closest('.overflow-y-auto');
      if (container) {
        const offset = element.offsetTop - 100;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      } else {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  if (headings.length === 0) {
    return (
      <div className="h-full bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t('outline.title')}</h3>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('outline.empty')}</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{t('outline.title')}</h3>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-2">
          {headings.map((heading) => {
            const id = headingId(heading);
            return (
              <button
                key={id}
                onClick={() => handleClick(heading)}
                className={`
                  w-full text-left px-3 py-2 rounded-md text-sm transition-colors
                  hover:bg-accent
                  ${activeId === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}
                `}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 12}px` }}
              >
                {heading.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
