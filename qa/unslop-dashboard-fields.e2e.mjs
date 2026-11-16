import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium, webkit } from 'playwright'

const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5178'
mkdirSync('qa/screenshots', { recursive: true })

async function withScreen(browser, width, query, test) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, hasTouch: width < 801,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion: 'reduce',
  })
  const failures = []
  await context.route('**/*', route => {
    const url = route.request().url()
    if ([origin + '/', 'data:', 'blob:'].some(prefix => url.startsWith(prefix))) return route.continue()
    failures.push('External request: ' + url)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => failures.push(error.message))
  try {
    await page.goto(origin + '/qa/index.html?screen=' + query, { waitUntil: 'networkidle' })
    // This synthetic page reuses the production content and sidebar CSS.
    if (width > 800) await page.addStyleTag({ content: '.app-shell[data-qa] { display: grid !important; }' })
    await test(page)
    assert.deepEqual(failures, [])
  } finally {
    await context.close()
  }
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
}

for (const [engine, launcher, widths] of [['chromium', chromium, [320, 390, 1280]], ['webkit', webkit, [390]]]) {
  if (process.env.QA_BROWSER && process.env.QA_BROWSER !== engine) continue
  const browser = await launcher.launch()
  try {
    for (const width of widths) {
      const screenshot = (page, name) => page.screenshot({
        path: `qa/screenshots/unslop-${engine}-${name}-${width}.png`, fullPage: true, animations: 'disabled',
      })
      await withScreen(browser, width, 'dashboard&taskDelay=1', async page => {
        const task = page.locator('.home-work-column.overdue article').first()
        await task.waitFor()
        await noOverflow(page)
        const warning = page.locator('.garden-kpi.warning')
        assert.equal(await warning.count(), 1)
        await page.waitForFunction(() => {
          const card = document.querySelector('.garden-kpi.warning')
          return card && getComputedStyle(card).backgroundColor === 'rgb(255, 251, 239)'
        }, null, { timeout: 5000 })
        await screenshot(page, 'dashboard')
        await task.getByRole('button', { name: '完了' }).click()
        await task.getByRole('button', { name: '更新中' }).waitFor()
        assert.ok(await page.locator('.home-work-column.today article button').isDisabled())
        await page.getByRole('status').filter({ hasText: '「架空の圃場点検」を完了しました。' }).waitFor()
        assert.equal(await page.locator('.home-work-column.overdue article').count(), 0)
        assert.deepEqual(await page.evaluate(() => window.__qa_home_task_changed), { id: 'qa-home-overdue', status: 'DONE' })
      })

      await withScreen(browser, width, 'fields', async page => {
        const card = page.locator('.field-master-card').first()
        await card.waitFor()
        await noOverflow(page)
        for (const control of [card.getByRole('link'), card.getByRole('button', { name: '編集' }), card.getByRole('button', { name: '削除' })]) {
          assert.ok((await control.boundingBox()).height >= 44)
        }
        assert.equal(await card.getByRole('link').getAttribute('href'), '/fields/qa-field')
        await screenshot(page, 'fields')
        const edit = card.getByRole('button', { name: '編集' })
        await edit.click()
        const heading = page.getByRole('heading', { name: '圃場を編集 · QA-A' })
        await heading.waitFor()
        assert.equal(await heading.evaluate(el => document.activeElement === el), true)
        const name = page.getByRole('textbox', { name: '圃場名' })
        await name.click()
        const style = await name.evaluate(el => {
          const css = getComputedStyle(el)
          return { border: css.borderTopWidth, outline: css.outlineWidth, offset: css.outlineOffset,
            shadow: css.boxShadow, font: Number.parseFloat(css.fontSize), height: el.offsetHeight }
        })
        assert.deepEqual([style.border, style.outline, style.offset, style.shadow], ['1px', '2px', '-2px', 'none'])
        assert.ok(style.font >= 16 && style.height >= 44)
        await noOverflow(page)
        await screenshot(page, 'field-form')
        const close = page.getByRole('button', { name: '圃場フォームを閉じる' })
        await close.click()
        assert.equal(await edit.evaluate(el => document.activeElement === el), true)
        await edit.click()
        await name.fill('')
        const save = page.getByRole('button', { name: '変更を保存' })
        await save.click()
        await page.getByRole('alert').filter({ hasText: '圃場名を入力してください。' }).waitFor()
        await name.fill('架空茶園・更新')
        await save.click()
        await page.getByRole('button', { name: '保存中…' }).waitFor()
        await page.getByRole('status').filter({ hasText: 'QA-A 架空茶園・更新 を更新しました。' }).waitFor()
        await card.getByRole('heading', { name: '架空茶園・更新' }).waitFor()
      })
      console.log(`PASS ${engine} ${width}px dashboard + field layouts, focus, feedback and edit`)
    }

    await withScreen(browser, 390, 'fields&saveError=1', async page => {
      await page.getByRole('button', { name: '圃場追加' }).click()
      const name = page.getByRole('textbox', { name: '圃場名' })
      await name.fill('架空茶園・新規')
      await page.getByRole('spinbutton', { name: '面積（m²）' }).fill('255')
      const save = page.getByRole('button', { name: '圃場を追加', exact: true })
      await save.click()
      await page.getByRole('alert').filter({ hasText: '架空の圃場保存エラー' }).waitFor()
      assert.equal(await name.inputValue(), '架空茶園・新規')
      assert.ok(await save.isEnabled())
    })
    await withScreen(browser, 390, 'fields', async page => {
      await page.getByRole('button', { name: '圃場追加' }).click()
      await page.getByRole('textbox', { name: '圃場名' }).fill('架空茶園・新規')
      await page.getByRole('spinbutton', { name: '面積（m²）' }).fill('255')
      await page.getByRole('button', { name: '圃場を追加', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'QA-NEW 架空茶園・新規 を追加しました。' }).waitFor()
      const created = page.locator('.field-master-card').filter({ hasText: 'QA-NEW' })
      await created.waitFor()
      page.on('dialog', dialog => dialog.accept())
      await created.getByRole('button', { name: '削除' }).click()
      await page.getByRole('status').filter({ hasText: 'QA-NEW を削除しました。' }).waitFor()
      await created.waitFor({ state: 'detached' })
    })
    await withScreen(browser, 390, 'fields&viewOnly=1', async page => {
      await page.locator('.field-master-card').getByRole('link').waitFor()
      assert.equal(await page.getByRole('button', { name: /圃場追加|編集|削除/ }).count(), 0)
    })
    await withScreen(browser, 390, 'dashboard&taskError=1&taskDelay=1', async page => {
      const task = page.locator('.home-work-column.overdue article').first()
      await task.getByRole('button', { name: '完了' }).click()
      await page.getByRole('alert').filter({ hasText: '架空のタスク更新エラー' }).waitFor()
      assert.ok(await task.getByRole('button', { name: '完了' }).isEnabled())
    })
    console.log(`PASS ${engine} field create/delete, read-only and recoverable save/task errors`)
  } finally {
    await browser.close()
  }
}
