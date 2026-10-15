(() => {
  'use strict';

  function initImageViewer() {
    const dialog = document.getElementById('imageViewerDialog');
    const viewerImage = document.getElementById('imageViewerImage');
    const viewerName = document.getElementById('imageViewerName');
    const viewerRole = document.getElementById('imageViewerRole');
    const viewerDetails = document.getElementById('imageViewerDetails');
    const viewerSource = document.getElementById('imageViewerSource');
    const closeButton = document.getElementById('closeImageViewer');
    if (!dialog || !viewerImage || !viewerName || !viewerRole || !viewerDetails || !viewerSource || !closeButton) return;

    let lastFocus = null;
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const text = (root, selector) => normalize(root?.querySelector(selector)?.textContent);

    function safeSource(anchor) {
      if (!anchor?.href) return null;
      try {
        const url = new URL(anchor.href, document.baseURI);
        return /^https?:$/.test(url.protocol) ? { href: url.href, label: normalize(anchor.textContent) || 'فتح المصدر ↗' } : null;
      } catch {
        return null;
      }
    }

    function contextFor(image) {
      const alt = normalize(image.dataset.photoName || image.alt || image.title);
      const leader = image.closest('.leadership-person');
      if (leader) {
        const sources = [...leader.querySelectorAll('.leadership-person-source')];
        const sourceAnchor = leader.querySelector('.leadership-person-source[href]');
        const notes = sources.filter(item => item.tagName !== 'A').map(item => normalize(item.textContent)).filter(Boolean);
        return {
          name: text(leader, '.leadership-person-name') || alt || 'صورة من قيادات بورسعيد',
          role: text(leader, '.leadership-person-title') || 'بيانات المنصب غير متاحة',
          details: image.dataset.photoDetails || notes.join(' · ') || 'الاسم والمنصب موضحان في بطاقة القيادة.',
          source: safeSource(sourceAnchor)
        };
      }

      const school = image.closest('.school-profile-card');
      if (school) {
        const details = [text(school, '.school-profile-meta'), text(school, '.school-profile-librarian'), text(school, '.school-profile-leadership')].filter(Boolean).join(' · ');
        return { name: text(school, 'strong') || alt || 'مدرسة مشاركة', role: 'ملف مدرسة في دليل المكتبات', details: details || 'الشعارات والبيانات تخص ملف المدرسة الظاهر للعامة.', source: null };
      }

      const brand = image.closest('.brand,.footer-brand,.dialog-brand');
      if (brand) {
        return { name: text(brand, '.brand-copy strong, strong') || alt || 'هوية مكتبات بورسعيد', role: text(brand, '.brand-copy small, small') || 'هوية الموقع', details: 'شعار أو علامة تعريفية للموقع.', source: safeSource(image.closest('a[href]')) };
      }

      const hero = image.closest('.hero-image-wrap');
      if (hero) {
        return { name: text(hero, '.image-caption strong') || alt || 'صورة الصفحة الرئيسية', role: text(hero, '.image-caption small') || 'الصورة الرئيسية للموقع', details: 'صورة توضيحية ضمن الصفحة الرئيسية.', source: null };
      }

      const news = image.closest('.live-news-card,.education-news-card,.research-card');
      if (news) {
        const sourceAnchor = news.querySelector('.news-source-link[href],a[href]');
        return { name: text(news, '.news-card-title,h2,h3,strong') || alt || 'صورة خبر', role: text(news, '.news-source-name,.news-category') || 'خبر أو مادة تعليمية', details: text(news, '.news-card-summary,p') || 'صورة مرتبطة بالمادة المعروضة.', source: safeSource(sourceAnchor) };
      }

      const book = image.closest('.book-card,.openbooks-card');
      if (book) {
        return { name: text(book, 'h2,h3,strong') || alt || 'صورة كتاب', role: text(book, '.book-author,.openbooks-card-author') || 'عنصر في فهرس القراءة', details: text(book, '.book-meta,.openbooks-card-description,p') || 'تفاصيل الكتاب معروضة في بطاقته.', source: safeSource(book.querySelector('a[href]')) };
      }

      const branch = image.closest('.branch-card,.branch-placeholder');
      if (branch) {
        return { name: text(branch, 'strong,h2,h3') || alt || 'مكتبة مدرسية', role: 'مكتبة أو فرع مدرسي', details: text(branch, 'p') || 'تفاصيل المكتبة في بطاقتها.', source: null };
      }

      const figure = image.closest('figure');
      if (figure) {
        return { name: text(figure, 'figcaption') || alt || 'صورة توضيحية', role: image.dataset.photoRole || 'صورة من الموقع', details: image.dataset.photoDetails || '', source: safeSource(figure.querySelector('a[href]')) };
      }

      const card = image.closest('article,li,[class*="card"]');
      const cardName = text(card, 'h1,h2,h3,h4,strong');
      const cardRole = text(card, 'small,.muted,.source-name');
      const cardDetails = text(card, 'p');
      return {
        name: image.dataset.photoName || cardName || alt || 'صورة مكبرة',
        role: image.dataset.photoRole || cardRole || 'صورة من الموقع',
        details: image.dataset.photoDetails || cardDetails || 'لا توجد بيانات إضافية لهذه الصورة.',
        source: safeSource(card?.querySelector('a[href]') || image.closest('a[href]'))
      };
    }

    function decorate(image) {
      if (!(image instanceof HTMLImageElement) || image.closest('#imageViewerDialog')) return;
      image.classList.add('image-viewer-trigger');
      const control = image.closest('a,button');
      const context = contextFor(image);
      const accessibleName = `${context.name} — فتح الصورة المكبرة`;
      if (control) {
        control.dataset.imageViewerControl = 'true';
        control.setAttribute('aria-haspopup', 'dialog');
        if (control.tagName === 'A') {
          control.setAttribute('role', 'button');
          if (!control.hasAttribute('tabindex')) control.tabIndex = 0;
        }
        if (!control.hasAttribute('aria-label')) control.setAttribute('aria-label', accessibleName);
        if (control.dataset.imageViewerClickBound !== 'true') {
          control.dataset.imageViewerClickBound = 'true';
          control.addEventListener('click', event => {
            const selectedImage = control.querySelector('img.image-viewer-trigger');
            if (!selectedImage) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openViewer(selectedImage, control);
          });
        }
      } else {
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-haspopup', 'dialog');
        image.setAttribute('aria-label', accessibleName);
      }
      if (image.dataset.imageViewerBound === 'true') return;
      image.dataset.imageViewerBound = 'true';
      image.addEventListener('click', event => {
        const trigger = image.closest('a,button');
        event.preventDefault();
        if (trigger) event.stopPropagation();
        openViewer(image, trigger || image);
      });
      const keyboardTarget = control || image;
      if (keyboardTarget.dataset.imageViewerKeyboardBound !== 'true') {
        keyboardTarget.dataset.imageViewerKeyboardBound = 'true';
        keyboardTarget.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          const selectedImage = control?.querySelector('img.image-viewer-trigger') || image;
          if (!selectedImage || selectedImage.closest('#imageViewerDialog')) return;
          event.preventDefault();
          event.stopPropagation();
          openViewer(selectedImage, keyboardTarget);
        });
      }
    }

    function openViewer(image, focusTarget) {
      if (!image?.src) return;
      const context = contextFor(image);
      lastFocus = focusTarget || image;
      viewerImage.src = image.currentSrc || image.src;
      viewerImage.alt = `${context.name}${context.role ? ` — ${context.role}` : ''}`;
      viewerName.textContent = context.name;
      viewerRole.textContent = context.role;
      viewerDetails.textContent = context.details;
      if (context.source) {
        viewerSource.href = context.source.href;
        viewerSource.textContent = context.source.label;
        viewerSource.hidden = false;
      } else {
        viewerSource.removeAttribute('href');
        viewerSource.hidden = true;
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      closeButton.focus({ preventScroll: true });
    }

    document.querySelectorAll('img').forEach(decorate);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLImageElement) decorate(record.target);
        for (const node of record.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          if (node.matches('img')) decorate(node);
          node.querySelectorAll?.('img').forEach(decorate);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt', 'title'] });

    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      viewerImage.removeAttribute('src');
      if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
      lastFocus = null;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initImageViewer, { once: true });
  else initImageViewer();
})();
