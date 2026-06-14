"""
Minimal Selenium test — opens the detector page, fills the form, submits it.

Usage:
    python test_selenium.py
    python test_selenium.py --headless
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait
import random
import time
# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
CHROME_BINARY = os.getenv(
    "CHROME_BINARY",
    r"D:\project\ntsw.ir\static\browser\chrome-win\chrome.exe",
)
CHROMEDRIVER = os.getenv(
    "CHROMEDRIVER",
    r"D:\project\ntsw.ir\static\browser\chromedriver-win64\chromedriver.exe",
)
BASE_URL = "http://127.0.0.1:3000"

# Form data
NAME    = "Selenium Tester"
EMAIL   = "selenium@botlab.example.com"
REASON  = "testing"
MESSAGE = "Automated form fill test."


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def human_type(el, text: str) -> None:
    # disabled — direct send_keys (bot mode)
    for ch in text:
        el.send_keys(ch)
        time.sleep(random.uniform(0.08, 0.18))
    # el.send_keys(text)


def build_driver(headless: bool) -> webdriver.Chrome:
    options = Options()
    options.binary_location = CHROME_BINARY

    # --- Stability & suppression flags (same strategy as driver_factory.py) ---
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-webgl")
    options.add_argument("--disable-features=VizDisplayCompositor")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")
    options.add_argument("--disable-sync")
    options.add_argument("--metrics-recording-only")
    options.add_argument("--mute-audio")
    options.add_argument("--log-level=3")
    options.add_argument("--disable-webgpu")
    options.add_argument("--silent")
    options.add_argument("--disable-logging")

    # --- Window ---
    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
    else:
        options.add_argument("--start-maximized")

    # --- Suppress automation flags (reduces CMD popups from helper processes) ---
    # options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    # options.add_experimental_option("useAutomationExtension", False)

    # --- Preferences ---
    options.add_experimental_option("prefs", {
        "profile.default_content_setting_values.notifications": 2,
        "profile.default_content_setting_values.geolocation": 2,
        "profile.password_manager_enabled": False,
        "credentials_enable_service": False,
    })

    # --- Service — log_path=NUL suppresses chromedriver log output ---
    service = Service(
        executable_path=CHROMEDRIVER,
        log_path="NUL",
    )
    if sys.platform == "win32":
        service.creation_flags = subprocess.CREATE_NO_WINDOW

    driver = webdriver.Chrome(service=service, options=options)

    # Remove navigator.webdriver flag so anti-bot checks don't trivially catch it
    # (comment this out if you want the bot signals to fire normally)
    # driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    return driver


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true")
    args = parser.parse_args()

    driver = build_driver(args.headless)
    wait   = WebDriverWait(driver, 20)

    try:
        print(f"Opening {BASE_URL} ...")
        driver.get(BASE_URL)

        wait.until(EC.presence_of_element_located((By.ID, "name")))
        print("Page loaded.")

        el = driver.find_element(By.ID, "name")
        el.click()
        human_type(el, NAME)

        el = driver.find_element(By.ID, "email")
        el.click()
        human_type(el, EMAIL)

        Select(driver.find_element(By.ID, "reason")).select_by_value(REASON)

        el = driver.find_element(By.ID, "message")
        el.click()
        human_type(el, MESSAGE)

        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        print("Form submitted. Waiting for result...")

        verdict_el = wait.until(
            EC.presence_of_element_located((
                By.XPATH,
                "//*[contains(@class,'rounded-full') and ("
                "  normalize-space(.)='BOT' or"
                "  normalize-space(.)='SUSPICIOUS' or"
                "  normalize-space(.)='HUMAN'"
                ")]",
            ))
        )
        print(f"Done. Verdict: {verdict_el.text.strip()}")

        if not args.headless:
            input("\nPress Enter to close the browser...")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
