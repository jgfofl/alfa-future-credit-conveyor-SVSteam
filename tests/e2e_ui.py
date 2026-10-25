"""Сквозной UI-тест (опционально): pip install playwright && playwright install chromium
Запуск: поднять сервисы (docker compose up) и выполнить  python tests/e2e_ui.py http://localhost:8080"""
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
Q = "?ml=" + (sys.argv[2] if len(sys.argv) > 2 else "/ml")
errs = []


def login(pg, who, bank=False):
    if bank:
        pg.click("button:has-text('Сотрудник банка')")
    pg.click(f"text={who}")
    pg.wait_for_timeout(400)


def chip(pg):
    return pg.inner_text(".page-head .chip")


def wizard_to_review(pg, goal, inn, name, emp, fin, amount=None):
    pg.click("text=Подать заявку на кредит")
    pg.click(f"text={goal}")
    pg.click("button:has-text('Далее')")
    if amount:
        pg.fill("#amount", amount)
    pg.click("button:has-text('Далее')")
    pg.fill("#inn", inn)
    pg.click("button:has-text('Найти в реестре')")
    pg.wait_for_timeout(500)
    if name:
        pg.fill("#coname", name)
    if emp:
        pg.fill("#emp", emp)
    pg.click("button:has-text('Далее')")
    for sel, v in fin.items():
        pg.fill(sel, v)
    pg.click("button:has-text('Далее')")
    pg.click("button:has-text('Далее')")
    pg.check("#consent")
    pg.click("button:has-text('Отправить заявку')")


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/index.html" + Q)
    pg.wait_for_timeout(400)

    # 1. клиент: автоодобрение -> принять -> подписать -> выдача
    login(pg, "Алексей Громов")
    wizard_to_review(pg, "Закрыть кассовый разрыв", "7701234567", None, None, {})
    pg.wait_for_timeout(4500)
    assert chip(pg) == "Предложение готово", chip(pg)
    pg.click("button:has-text('Принять предложение')")
    pg.check("#agree")
    pg.click("button:has-text('Подписать договор')")
    pg.wait_for_timeout(2800)
    assert chip(pg) == "Средства выданы", chip(pg)

    # 2. ликвидированная организация блокируется на шаге «Компания»
    pg.click("button[aria-label='Выйти']")
    login(pg, "Ирина Петрова")
    pg.click("text=Подать заявку на кредит")
    pg.click("text=Пополнить оборотные средства")
    pg.click("button:has-text('Далее')"); pg.click("button:has-text('Далее')")
    pg.fill("#inn", "7701234500"); pg.click("button:has-text('Найти в реестре')"); pg.wait_for_timeout(400)
    pg.fill("#coname", "ООО Тест"); pg.fill("#emp", "3"); pg.click("button:has-text('Далее')")
    assert "ликвидирована" in pg.inner_text("main"), "liquidated INN must block"
    pg.fill("#inn", "1234"); pg.click("button:has-text('Найти в реестре')")
    assert "10 цифр" in pg.inner_text("main")

    # 3. сбой бюро (чистое состояние демо-данных) -> очередь сотрудника -> запрос данных -> ответ клиента -> решение
    pg.evaluate("localStorage.removeItem('alfa-credit-cabinet.v1')"); pg.reload(); pg.wait_for_timeout(400)
    login(pg, "Ирина Петрова")
    wizard_to_review(pg, "Купить оборудование или технику", "770123456799", "ИП Петрова И. С.", "4",
                     {"#revenue": "12 000 000", "#netProfit": "1 800 000", "#debt": "600 000", "#avgBalance": "900 000"}, "2 000 000")
    pg.wait_for_timeout(4200)
    assert chip(pg) == "На рассмотрении", chip(pg)
    pg.click("button[aria-label='Выйти']")
    login(pg, "Мария Орлова", bank=True)
    pg.click("tr:has-text('ИП Петрова')")
    pg.fill("textarea[placeholder^='Что нужно']", "Подтвердите выручку выпиской")
    pg.click("button:has-text('Отправить запрос')"); pg.wait_for_timeout(300)
    assert chip(pg) == "Ждём клиента", chip(pg)
    pg.click("button[aria-label='Выйти']")
    login(pg, "Ирина Петрова")
    pg.click(".app-row"); pg.wait_for_timeout(200)
    pg.fill("textarea", "Выписка приложена")
    pg.click("button:has-text('Отправить ответ')"); pg.wait_for_timeout(300)
    assert chip(pg) == "На рассмотрении", chip(pg)
    pg.click("button[aria-label='Выйти']")
    login(pg, "Дмитрий Волков", bank=True)
    pg.click("tr:has-text('ИП Петрова')")
    pg.click("button[role=tab]:has-text('Одобрить')")
    pg.click("button:has-text('Одобрить заявку')"); pg.wait_for_timeout(300)
    assert chip(pg) == "Предложение отправлено", chip(pg)
    b.close()

assert not errs, errs
print("UI e2e: OK")
