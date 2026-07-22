FROM baserow/baserow:2.3.2

COPY ./linx_baserow /baserow/data/plugins/linx_baserow
COPY ./BASEROW-LICENSE.txt /licenses/BASEROW-LICENSE.txt
RUN find /baserow/data/plugins/linx_baserow -name '*.sh' -exec chmod +x {} +
RUN /baserow/plugins/install_plugin.sh --folder /baserow/data/plugins/linx_baserow

ENV BASEROW_OSS_ONLY=1
