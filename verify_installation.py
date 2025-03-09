import sys

def check_import(module_name):
    try:
        __import__(module_name)
        print(f"{module_name} imported successfully")
    except ImportError as e:
        print(f"Failed to import {module_name}: {e}")

if __name__ == "__main__":
    core_modules = [
        "matplotlib",
        "psutil",
        "xgboost",
        "scipy",
        "lightgbm",
        "numpy",
        "pandas"
    ]

    for module in core_modules:
        check_import(module)
