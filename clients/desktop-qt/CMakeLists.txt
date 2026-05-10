cmake_minimum_required(VERSION 3.16)

project(WorkPlatformDesktop VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Network)

add_executable(work-platform-desktop
  src/main.cpp
  src/app/MainWindow.cpp
  src/app/MainWindow.h
)

target_link_libraries(work-platform-desktop PRIVATE
  Qt6::Widgets
  Qt6::Network
)
