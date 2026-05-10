#include "MainWindow.h"

#include <QLabel>

MainWindow::MainWindow(QWidget *parent) : QMainWindow(parent) {
  setWindowTitle("Work Platform");
  resize(1024, 720);

  auto *label = new QLabel("Work Platform Desktop", this);
  label->setAlignment(Qt::AlignCenter);
  setCentralWidget(label);
}
