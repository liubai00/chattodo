from setuptools import find_packages, setup


setup(
    name="linx-baserow",
    version="0.1.0",
    packages=find_packages("src"),
    package_dir={"": "src"},
    include_package_data=True,
)
