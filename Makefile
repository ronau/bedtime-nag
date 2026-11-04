# Thin wrapper: all the logic is in bin/bedtime-nag.
#   make install
#   make uninstall                          # removes settings too
#   make uninstall ARGS=--keep-settings

.PHONY: install uninstall

install:
	./bin/bedtime-nag install

uninstall:
	./bin/bedtime-nag uninstall $(ARGS)
