inherit kernel-resin

FILESEXTRAPATHS_prepend := "${THISDIR}/${PN}:"

SRC_URI_append = " \
    file://aufs.cfg \
    "
