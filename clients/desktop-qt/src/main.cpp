#include <QApplication>

#include "app/MainWindow.h"

int main(int argc, char *argv[]) {
  QApplication app(argc, argv);
  QApplication::setApplicationName("Work Platform");
  QApplication::setOrganizationName("Internal");

  MainWindow window;
  window.show();

  return app.exec();
}
