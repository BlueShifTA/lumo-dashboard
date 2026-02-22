import numpy.typing as npt

FONT_HERSHEY_SIMPLEX: int
COLOR_BGR2GRAY: int
COLOR_GRAY2BGR: int
IMWRITE_JPEG_QUALITY: int

class _CLAHE:
    def apply(self, image: npt.NDArray[object]) -> npt.NDArray[object]: ...

def imwrite(filename: str, image: npt.NDArray[object]) -> bool: ...
def putText(
    image: npt.NDArray[object],
    text: str,
    org: tuple[int, int],
    fontFace: int,
    fontScale: float,
    color: tuple[int, int, int],
    thickness: int,
) -> npt.NDArray[object]: ...
def circle(
    image: npt.NDArray[object],
    center: tuple[int, int],
    radius: int,
    color: tuple[int, int, int],
    thickness: int,
) -> npt.NDArray[object]: ...
def cvtColor(src: npt.NDArray[object], code: int) -> npt.NDArray[object]: ...
def createCLAHE(*, clipLimit: float, tileGridSize: tuple[int, int]) -> _CLAHE: ...
def imencode(
    ext: str, image: npt.NDArray[object], params: list[int]
) -> tuple[bool, npt.NDArray[object]]: ...
