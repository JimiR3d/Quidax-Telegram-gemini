import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on('console', lambda msg: print(f'Console [{msg.type}]: {msg.text}'))
        page.on('pageerror', lambda exc: print(f'Page Error: {exc}'))
        print("Navigating to localhost:3000")
        try:
            await page.goto('http://localhost:3000', wait_until='networkidle')
            print("Navigation complete. Waiting a bit.")
            await asyncio.sleep(2)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
