---
title: SDC Amon Probes Documentation
markdown2extras: tables, code-friendly
apisections:
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright 2020 Joyent, Inc.
-->

# About This Document

The following document contains the documentation of all SDC Amon probes that
are maintained by `amonadm`. `amonadm` is a service that runs in the SDC zone
and installs 'admin' owned probes on a SDC datacenter. It also takes care of
keeping probes updated by periodically running a cronjob, making sure that Amon
always has up-to-date copies of the probe files defined in the SDC git
repository.

`amonadm` organizes SDC probes by SAPI role. Each SAPI role might refer to one
or more VMs that are running the same service, for HA purposes. This means that
if a probe is a defined for a single role, Amon will install the same probe for
every VM that belongs to such service.

# SDC Amon Probes Documentation

## Probe Type Definitions

The following are all the probe types available on Amon. For a more in-depth
explanation for each type, please refer to the official [Amon Documentation](https://mo.joyent.com/docs/amon/master/#probe-types)

| Type             | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| machine-up       | Watch for a vm going down (shutdown, reboot)                                 |
| log-scan         | Watch for a pattern in a log file                                            |
| bunyan-log-scan  | Watch for a pattern or field matches in a Bunyan log file                    |
| http             | Hit an HTTP(S) endpoint and assert a status, body match, response time, etc. |
| icmp (i.e. ping) | Ping a host and assert a response time, etc.                                 |
| cmd              | Run a command and assert an exit status, stdout match                        |
| disk-usage       | Checks that free space on a mountpoint doesn't drop below a threshold        |

## Common Probes

Every SAPI instance will have these probes installed. Probes of this type should
monitor events specific to the operating system and not the application they are
running.

| Probe Name | Probe Type | Configuration | Causes                 | Actions To Take                                      |
| ---------- | ---------- | ------------- | ---------------------- | ---------------------------------------------------- |
| zone up    | machine-up | -             | Machine is not running | Log in to CN and review the running status of the VM |

## CNAPI Probes

| Probe Name                                        | Probe Type | Configuration                                              | Causes                                                                                        | Actions To Take                                                                                                                           |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| dapi saw malformed server object in request       | log-scan   | Pattern match "Skipping server in request"                 | A call to POST /allocation has found a malformed server record                                | Review the server object directly with sdc-cnapi /servers/:uuid                                                                           |
| dapi assumed filled server due to missing cpu_cap | log-scan   | Regex pattern match "Server .{36} VM .{36} has no cpu_cap" | A call to POST /allocation has found a server record that has at least one VM without cpu_cap | Review all VMs on the compute node. The compute node will not be provisionable as long as VMs with no cpu_cap have been provisioned there |
| root dataset running low on space                 | disk-usage | Path: "/"                                                  | Zone root dataset is running out of space                                                     | Verify disk usage in zone. Rotated log files that stay around are a common cause                                                          |
| cnapi service stopped                             | log-scan   | Pattern match "Stopping because"                           | CNAPI service is restarting (unless it has been manually stopped)                             | Check the`cnapi` SMF service logs for any clues on why the service has restarted and verify it is not repeatedly restarting               |

## IMGAPI Probes

| Probe Name | Probe Type | Configuration | Causes | Actions To Take |
| ---------- | ---------- | ------------- | ------ | --------------- |
| imgapi image creation failure | bunyan-log-scan | Pattern match {"route": "updateimage", "action": "create-from-vm"} | Custom image creation job has failed | Review the image creation job error by calling sdc-workflow /jobs?image_uuid={image_uuid} or get the job directly by calling sdc-workflow /jobs/{job_uuid} |
| imgapi log fatal/error | bunyan-log-scan | Pattern match {"level": "error or fatal"} | IMGAPI service has logged a fatal or error event | Review the `imgapi` SMF service logs for more context on the log events |
| imgapi service stopped | log-scan | Pattern match "Stopping because" | IMGAPI service is restarting (unless it has been manually stopped) | Check the `imgapi` SMF service logs for any clues on why the service has restarted and verify it is not repeatedly restarting |

## SDC Probes

| Probe Name | Probe Type | Configuration | Causes | Actions To Take |
| ---------- | ---------- | ------------- | ------ | --------------- |
| check-amqp-online | cmd | /opt/smartdc/sdc/bin/sdc-check-amqp | Script was not able to connect to AMQP and it returned a non-zero exit code | Review the rabbitmq service zones. SMF service should be running. Use `sdc-healthcheck` to make sure all services that depend on AMQP are running correctly |
| dump-hourly-sdc-data error | log-scan | Pattern match "error" on file "/var/log/dump-hourly-sdc-data.log" | Hourly SDC data dump script has failed | Review log file for more context on the cause of the error |
| upload-sdc-data error | log-scan | Pattern match "error" on file "/var/log/upload-sdc-data.log" | Upload SDC data dump script has failed | Review log file for more context on the cause of the error |
| hermes log warn/error/fatal | bunyan-log-scan | Pattern match {"level": "warn or error or fatal"} | Hermes service has logged a warn or error or fatal event | Review the `hermes` SMF service logs for more context on the log events |

## UFDS Probes

| Probe Name | Probe Type | Configuration | Causes | Actions To Take |
| ---------- | ---------- | ------------- | ------ | --------------- |
| ufds-replicator log warn/error/fatal | bunyan-log-scan | Pattern match {"level": "warn or error or fatal"} | UFDS replicator service has logged a warn or error or fatal event | Review the `ufds-replicator` SMF service logs for more context on the log events. Replication errors are usually produced when the integrity of the local UFDS is broken after making local changes that conflict with upstream changes. Also sometimes these errors just reflect the replicator's inability to connect to the UFDS upstream server |

## VMAPI Probes

| Probe Name | Probe Type | Configuration | Causes | Actions To Take |
| ---------- | ---------- | ------------- | ------ | --------------- |
| duplicate UUID detected | bunyan-log-scan | Pattern match "Found duplicate VM UUIDs" | VMAPI has detected two VMs with the same UUID | It probably means that the origin VM was not destroyed and it was left in a "installed" state. Destroying the origin VM or marking it as "do_not_inventory" should fix the issue |
| vmapi log warn/fatal | bunyan-log-scan | Pattern match {"level": "warn/error/fatal"} | VMAPI service has logged a warn/fatal event | Review the `vmapi` SMF service logs for more context on the log events |
| vmapi lost connection to moray | bunyan-log-scan | Pattern match "client closed" | VMAPI's connection to Moray has been lost | Review the `vmapi` SMF service logs for more context on the moray reconnection status. VMAPI should reconnect to Moray automatically. If VMAPI is unable to reconnect to Moray then review other services that depend on Moray (and the `moray` service itself) in search for a common issue. If VMAPI is the only service unable to reconnect then the `vmapi` service might need to be restarted |
| vmapi nic error | bunyan-log-scan | Pattern match "Could not add NIC" | VMAPI has found a VM with invalid NICs | Usually test VMs are created manually and their NICs don't have valid data. The heartbeats from these VMs is detected by VMAPI and NAPI confirms that their NICs are invalid. If the VM cannot be destroyed then mark the VM as "do_not_inventory" so it can be ignored by VMAPI |

## Workflow Probes

| Probe Name            | Probe Type      | Configuration                                                       | Causes                     | Actions To Take                                                                                                                                 |
| --------------------- | --------------- | ------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| provision job failure | bunyan-log-scan | Pattern match {"job.execution": "failed", "pattern": "provision-*"} | A provision job has failed | Review the provision job error by calling sdc-workflow /jobs?vm_uuid={vm_uuid} or get the job directly by calling sdc-workflow /jobs/{job_uuid} |
