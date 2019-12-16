# Copyright 2017 The TensorFlow Lucid Authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Setup script for TensorFlow Lucid."""

from setuptools import setup, find_packages

test_deps = ["future", "twine", "pytest", "pytest-mock", "python-coveralls"]

extras = {
    "test": test_deps
}

setup(
    name="svelte-io-test",
    packages=find_packages(exclude=[]),
    description=(
        "Collection of infrastructure and tools for research in "
        "neural network interpretability."
    ),
    author="The Lucid Authors",
    license="Apache License 2.0",
    install_requires=[
        "numpy",
        "tensorflow==1.15.0",
        "scipy",
        "scikit-learn",
        "umap-learn",
        "nltk",
        "ipython",
        "pillow",
        "future",
        "decorator",
        "pyopengl",
        "filelock",
        "cachetools",
        "more-itertools",
    ],
    setup_requires=["pytest-runner"],
    tests_require=test_deps,
    extras_require=extras,
)