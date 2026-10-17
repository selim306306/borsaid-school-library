# بطاقة المشاركة الاجتماعية

بطاقة `social-preview-20261018.jpg` تحمل الاسم «المكتبة المدرسية الرقمية» مع إبقاء بورسعيد نطاقًا للخدمة. أُعيد إعدادها من عناصر البطاقة السابقة نفسها: صورة الرفوف الأصلية والشعار والألوان، دون توليد صور بالذكاء الاصطناعي.

المصدر القابل للتحرير: `social-preview-source.html`.
الصورة المحلية: `header-gallery/library-bookshelf.webp`، تصوير [Mshuang2 على Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Library_bookshelf.jpg)، ترخيص [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). الشعار: `mark.svg` من هوية الموقع الحالية. البطاقة لا تمثل صورة لمكتبة مدرسة بعينها في بورسعيد.

لإعادة التصدير من جذر المشروع، بعد تثبيت WeasyPrint وPoppler وخط Noto Sans Arabic:

```sh
python3 -c "from weasyprint import HTML; HTML('assets/social-preview-source.html').write_pdf('/tmp/library-card.pdf')"
pdftoppm -singlefile -scale-to-x 1200 -scale-to-y 630 -jpeg -jpegopt quality=92 /tmp/library-card.pdf assets/social-preview-20261018
```

الأبعاد: 1200 × 630. راجع الصورة بصريًا بعد أي تعديل. بيانات Open Graph وTwitter الثابتة تشير إلى هذه البطاقة؛ يبقى اختيار المالك المحفوظ في مكتبة الوسائط، إن وجد، دون تغيير.
